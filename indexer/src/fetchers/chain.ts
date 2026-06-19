/**
 * Shared helper to read-only call a deployed contract on the Stacks chain.
 * Config is fully driven by environment variables. There are no fallbacks
 * to testnet — running this without explicit env vars is always a misconfig.
 */
import { serializeCV, deserializeCV, uintCV } from "@stacks/transactions";

const STACKS_API = process.env["STACKS_API_URL"];
const DEPLOYER = process.env["DEPLOYER_ADDRESS"];

if (!STACKS_API || !DEPLOYER) {
  throw new Error(
    "[chain] STACKS_API_URL and DEPLOYER_ADDRESS env vars are required " +
      "(no testnet fallback)."
  );
}

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

/**
 * Decode a Clarity read-only uint result that may be either a bare `uint`
 * (type byte 01) or an `(ok uint)` response (07 01). Throws on `(err …)`.
 */
function decodeUintFlexible(hex: string): number {
  const raw = (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
  let valueHex: string;
  if (raw.startsWith("07")) {
    const inner = raw.slice(2);
    if (!inner.startsWith("01")) throw new Error("ok-response inner is not a uint");
    valueHex = inner.slice(2);
  } else if (raw.startsWith("08")) {
    throw new Error("Clarity call returned err response");
  } else if (raw.startsWith("01")) {
    valueHex = raw.slice(2);
  } else {
    throw new Error("Unexpected Clarity type prefix");
  }
  if (valueHex.length === 0) throw new Error("empty uint payload");
  const value = BigInt(`0x${valueHex}`);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Chain uint exceeds JS safe-integer range");
  }
  return Number(value);
}

/**
 * Read-only call to an ARBITRARY contract (any issuer address) with serialized
 * Clarity arguments — used to read foreign protocols (e.g. the Zest vault's
 * convert-to-assets). `args` are hex-encoded Clarity values (see cvToHex).
 */
export async function readUintFromContract(
  address: string,
  contractName: string,
  functionName: string,
  args: string[] = []
): Promise<number> {
  assertSafeName(contractName, "contractName");
  assertSafeName(functionName, "functionName");
  if (!/^[A-Z0-9]+$/.test(address)) throw new Error(`Invalid address: ${address}`);

  const url = `${STACKS_API}/v2/contracts/call-read/${address}/${contractName}/${functionName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: DEPLOYER, arguments: args }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Chain read ${address}.${contractName}.${functionName} returned ${res.status}`);
  }

  const json: unknown = await res.json();
  if (
    typeof json !== "object" || json === null ||
    !("okay" in json) || !("result" in json) ||
    typeof (json as Record<string, unknown>)["result"] !== "string"
  ) {
    throw new Error(`Unexpected chain response shape for ${contractName}.${functionName}`);
  }
  const { okay, result } = json as { okay: boolean; result: string };
  if (!okay) throw new Error(`Contract error for ${contractName}.${functionName}`);

  return decodeUintFlexible(result);
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

// Consensus tolerance the adapter uses to agree two oracle reports (CONSENSUS-TOL-PCT).
const CONSENSUS_TOL_PCT = 10;

interface OracleReport {
  idx: number;
  bps: number;
  block: number;
}

/** Read one oracle slot's last report: (ok { bps, block }). Null on any error. */
async function readOracleReport(
  contractName: string,
  idx: number
): Promise<OracleReport | null> {
  assertSafeName(contractName, "contractName");
  const arg = "0x" + serializeCV(uintCV(idx));
  const url = `${STACKS_API}/v2/contracts/call-read/${DEPLOYER}/${contractName}/get-oracle-report`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: DEPLOYER, arguments: [arg] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { okay: boolean; result: string };
    if (!json.okay) return null;
    const cv = deserializeCV(json.result);
    // (ok { bps, block }) -> unwrap response, then tuple
    if (cv.type !== "ok") return null;
    const tuple = cv.value;
    if (tuple.type !== "tuple") return null;
    const fields = tuple.value as Record<string, { value: bigint } | undefined>;
    const bps = Number(fields["bps"]?.value ?? 0n);
    const block = Number(fields["block"]?.value ?? 0n);
    return { idx, bps, block };
  } catch {
    return null;
  }
}

/**
 * Returns the adapter's real committed APY anchor in bps — even when the oracle
 * is STALE (get-apy returns err). The on-chain deviation guard compares any new
 * report against the live `current-apy-bps` var (not get-apy), so the pusher
 * MUST know that real value to stay inside the guard; otherwise a stale read
 * (current=0) makes it jump to the bootstrap reference and the contract aborts
 * every push (err u109), trapping the APY stale forever.
 *
 * Fresh path: get-apy succeeds -> that's the anchor.
 * Stale path: reconstruct from the oracle reports the same way the contract
 * commits — the average of a consensus pair (within CONSENSUS-TOL-PCT), else
 * the most recently reported value. Returns null when nothing is on-chain yet.
 */
export async function readAnchorApyBps(
  contractName: string
): Promise<number | null> {
  try {
    return await readUint(contractName, "get-apy");
  } catch {
    // stale — fall through and reconstruct from reports
  }

  const raw = await Promise.all(
    [0, 1, 2].map((i) => readOracleReport(contractName, i))
  );
  const reports = raw.filter(
    (r): r is OracleReport => r !== null && r.block > 0 && r.bps > 0
  );
  if (reports.length === 0) return null;

  // Mirror try-commit-consensus: average of the first pair within tolerance.
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const a = reports[i]!.bps;
      const b = reports[j]!.bps;
      if (b > 0 && Math.abs(a - b) * 100 <= CONSENSUS_TOL_PCT * b) {
        return Math.floor((a + b) / 2);
      }
    }
  }

  // No consensus pair — anchor to the most recent report.
  reports.sort((x, y) => y.block - x.block);
  return reports[0]!.bps;
}
