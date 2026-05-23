/**
 * Shared helper to read-only call a deployed contract on the Stacks chain.
 * Config is driven by environment variables for portability.
 */

const STACKS_API = process.env["STACKS_API_URL"] ?? "https://api.testnet.hiro.so";
const DEPLOYER = process.env["DEPLOYER_ADDRESS"] ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const TIMEOUT_MS = 8_000;

// Allow only alphanumeric and hyphens — prevents path traversal / injection.
const SAFE_NAME = /^[a-zA-Z0-9-]+$/;

function assertSafeName(name: string, label: string): void {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

/** Decode the uint result returned by a Clarity (ok uint) read-only call. */
function decodeUint(hex: string): number {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (raw.length < 6) throw new Error("Clarity response too short");
  // First byte: 07 = (ok ...), 08 = (err ...). Throw on err so callers
  // treat a stale/failed read-only as "no data" rather than misreading the
  // error code (e.g. u107 for err-stale-apy) as an APY value.
  if (raw.startsWith("08")) throw new Error("Clarity call returned err response");
  const valueHex = raw.slice(4); // skip "0701" (ok-response + uint type prefix)
  let value: bigint;
  try {
    value = BigInt(`0x${valueHex}`);
  } catch {
    throw new Error("Failed to parse uint from chain");
  }
  // Clarity uints are 128-bit; guard the JS safe-integer range instead of
  // silently losing precision the way parseInt(hex, 16) would.
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Chain uint exceeds JS safe-integer range");
  }
  return Number(value);
}

export async function readUint(
  contractName: string,
  functionName: string
): Promise<number> {
  assertSafeName(contractName, "contractName");
  assertSafeName(functionName, "functionName");

  const url = `${STACKS_API}/v2/contracts/call-read/${DEPLOYER}/${contractName}/${functionName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: DEPLOYER, arguments: [] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Chain read ${contractName}.${functionName} returned ${res.status}`);

  const json: unknown = await res.json();
  if (
    typeof json !== "object" ||
    json === null ||
    !("okay" in json) ||
    !("result" in json) ||
    typeof (json as Record<string, unknown>)["result"] !== "string"
  ) {
    throw new Error(`Unexpected chain response shape for ${contractName}.${functionName}`);
  }

  const { okay, result } = json as { okay: boolean; result: string };
  if (!okay) throw new Error(`Contract error for ${contractName}.${functionName}`);

  return decodeUint(result);
}

/** Fetch BTC/USD price from CoinGecko (module-level cache, 5-min TTL). */
let btcPriceCachedAt = 0;
let btcPriceUsd = 83_000; // sensible default

export async function getBtcPriceUsd(): Promise<number> {
  if (Date.now() - btcPriceCachedAt < 5 * 60 * 1000) return btcPriceUsd;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { signal: AbortSignal.timeout(5_000) }
    );
    if (res.ok) {
      const data: unknown = await res.json();
      const price =
        typeof data === "object" && data !== null &&
        "bitcoin" in data &&
        typeof (data as Record<string, Record<string, number>>)["bitcoin"]?.["usd"] === "number"
          ? (data as { bitcoin: { usd: number } }).bitcoin.usd
          : undefined;
      if (price !== undefined && price > 0) {
        btcPriceUsd = price;
        btcPriceCachedAt = Date.now();
      }
    }
  } catch (err) {
    console.warn("[chain] CoinGecko price fetch failed:", (err as Error).message);
  }
  return btcPriceUsd;
}

/** Convert satoshis to USD. */
export function satsToUsd(sats: number, btcPrice: number): number {
  return (sats / 1e8) * btcPrice;
}

export interface AdapterOracleState {
  apyBps: number;
  lastUpdatedBlock: number;
  isStale: boolean;
}

/**
 * Reads APY and last-updated-block from an adapter.
 * If get-apy returns an error (stale oracle), isStale is set to true.
 */
export async function readAdapterOracleState(
  contractName: string
): Promise<AdapterOracleState> {
  assertSafeName(contractName, "contractName");

  const [lastBlockResult, apyResult] = await Promise.allSettled([
    readUint(contractName, "get-last-updated-block"),
    readUint(contractName, "get-apy"),
  ]);

  const lastUpdatedBlock =
    lastBlockResult.status === "fulfilled" ? lastBlockResult.value : 0;

  if (apyResult.status === "rejected") {
    return { apyBps: 0, lastUpdatedBlock, isStale: true };
  }

  return { apyBps: apyResult.value, lastUpdatedBlock, isStale: false };
}

/**
 * Returns true if newBps deviates more than maxPct% from currentBps.
 * Used as a pre-flight check before pushing APY on-chain.
 */
export function exceedsDeviation(
  newBps: number,
  currentBps: number,
  maxPct = 50
): boolean {
  if (currentBps === 0) return false;
  return (Math.abs(newBps - currentBps) / currentBps) * 100 > maxPct;
}

/**
 * Reads the raw bps last reported by an oracle slot, regardless of staleness.
 *
 * The adapter's `get-apy` hides the underlying `current-apy-bps` once
 * `last-updated-block` is older than STALE-BLOCKS (returns err-stale-apy with
 * no value). When that happens we still need *some* reference point to ramp
 * from — the on-chain deviation guard compares against the committed
 * `current-apy-bps`, not against zero. The last oracle-0 report is the closest
 * thing we can read directly, and it's almost always a good proxy because
 * the previous consensus commit was computed from it.
 *
 * Returns 0 if the slot has never reported.
 */
export async function readOracleReportBps(
  contractName: string,
  idx: number
): Promise<number> {
  assertSafeName(contractName, "contractName");
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) {
    throw new Error(`Invalid oracle idx: ${idx}`);
  }

  // Clarity uint argument: type byte 0x01 + 16-byte big-endian value
  const argHex = `0x01${idx.toString(16).padStart(32, "0")}`;

  const url = `${STACKS_API}/v2/contracts/call-read/${DEPLOYER}/${contractName}/get-oracle-report`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: DEPLOYER, arguments: [argHex] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Chain read ${contractName}.get-oracle-report returned ${res.status}`);

  const json: unknown = await res.json();
  if (
    typeof json !== "object" || json === null ||
    !("okay" in json) || !("result" in json) ||
    typeof (json as Record<string, unknown>)["result"] !== "string"
  ) {
    throw new Error(`Unexpected chain response shape for ${contractName}.get-oracle-report`);
  }
  const { okay, result } = json as { okay: boolean; result: string };
  if (!okay) throw new Error(`Contract error for ${contractName}.get-oracle-report`);

  // Response shape: (ok (tuple ((block uint) (bps uint))))
  // Fields are emitted alphabetically: block then bps.
  // Hex layout: 07 0c 00000002 05 "block" 01 <16B> 03 "bps" 01 <16B>
  const raw = (result.startsWith("0x") ? result.slice(2) : result).toLowerCase();
  const PREFIX = "070c0000000205626c6f636b01"; // ok + tuple(2) + len(5) + "block" + uint
  if (!raw.startsWith(PREFIX)) {
    throw new Error("Unexpected oracle-report shape");
  }
  // Skip prefix + 16-byte block value (32 hex) + "03" + "bps" (627073) + "01"
  const cursor = PREFIX.length + 32 + 2 + 6 + 2;
  const valueHex = raw.slice(cursor, cursor + 32);
  if (valueHex.length !== 32) throw new Error("Could not extract bps field");

  const value = BigInt(`0x${valueHex}`);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Oracle report bps exceeds JS safe-integer range");
  }
  return Number(value);
}
