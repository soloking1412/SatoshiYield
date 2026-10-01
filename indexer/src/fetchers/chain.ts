/**
 * Shared helper to read-only call a deployed contract on the Stacks chain.
 * Config is fully driven by environment variables. There are no fallbacks
 * to testnet — running this without explicit env vars is always a misconfig.
 */
import { validateStacksAddress } from "@stacks/transactions";
import { chainNetwork } from "../network.js";

const STACKS_API = chainNetwork.api;
const DEPLOYER = chainNetwork.deployer;

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
  // A uint is exactly 16 bytes. Accept only (ok uint), rejecting signed ints,
  // truncated payloads, non-hex values and trailing serialized values.
  if (!/^0701[0-9a-f]{32}$/i.test(raw)) {
    throw new Error("Expected an exact Clarity (ok uint) response");
  }
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
  if (okay !== true) throw new Error(`Contract error for ${contractName}.${functionName}`);

  return decodeUint(result);
}

/**
 * Decode a Clarity read-only uint result that may be either a bare `uint`
 * (type byte 01) or an `(ok uint)` response (07 01). Throws on `(err …)`.
 */
function decodeUintFlexible(hex: string): number {
  const raw = (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
  if (/^0701[0-9a-f]{32}$/.test(raw)) return decodeUint(raw);
  if (!/^01[0-9a-f]{32}$/.test(raw)) throw new Error("Expected an exact Clarity uint");
  const valueHex = raw.slice(2);
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
  if (!validateStacksAddress(address)) throw new Error(`Invalid address: ${address}`);

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
  if (okay !== true) throw new Error(`Contract error for ${contractName}.${functionName}`);

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

  if (apyResult.status === "rejected" || lastBlockResult.status === "rejected" ||
      lastUpdatedBlock === 0 || apyResult.value > 6000) {
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
 * Read the actual committed APY. Oracle reports are proposals, not committed
 * state: averaging them can invent an anchor that never existed on-chain.
 * The exact data variable is readable even after get-apy expires.
 */
export async function readAnchorApyBps(contractName: string): Promise<number | null> {
  assertSafeName(contractName, "contractName");
  try {
    const value = await readUint(contractName, "get-apy");
    return value <= 6000 ? value : null;
  } catch {
    // A stale response is expected; inspect committed state below.
  }
  try {
    const res = await fetch(
      `${STACKS_API}/v2/data_var/${DEPLOYER}/${contractName}/current-apy-bps?proof=0`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null || !("data" in data) ||
        typeof data.data !== "string") return null;
    const value = decodeUintFlexible(data.data);
    return value <= 6000 ? value : null;
  } catch {
    return null;
  }
}
