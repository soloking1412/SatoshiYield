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
  const valueHex = raw.slice(4); // skip "0701" (ok + uint prefix)
  const parsed = parseInt(valueHex, 16);
  if (!Number.isFinite(parsed)) throw new Error("Failed to parse uint from chain");
  return parsed;
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
