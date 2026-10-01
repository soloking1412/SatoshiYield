import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
} from "@stacks/transactions";
import { readAnchorApyBps, exceedsDeviation } from "./fetchers/chain.js";
import { ADAPTER_REGISTRY, adapterName, type ProtocolId } from "./registry.js";
import { chainNetwork } from "./network.js";

const DEPLOYER        = chainNetwork.deployer;
const ORACLE_KEY      = process.env["ORACLE_PRIVATE_KEY"]   ?? "";
const ORACLE_KEY_2    = process.env["ORACLE_PRIVATE_KEY_2"] ?? "";
const IS_MAINNET      = chainNetwork.name === "mainnet";
const STACKS_API_BASE = chainNetwork.api;
const WRITES_ENABLED = process.env["ORACLE_WRITES_ENABLED"] === "true";

// Conservative gas cost of one `set-apy` tx per oracle wallet, in µSTX. Observed
// fee is ~2,140 µSTX; padded up so runway is never over-estimated. Each wallet
// signs one tx per registered adapter per cycle.
const PER_PUSH_USTX = 3_000;

// A wallet is "low gas" once it can't cover this many more cycles. At the 30-min
// cadence, 96 cycles ≈ 2 days — days of lead time to refill BEFORE the on-chain
// APY can go stale (~5.5h window) and block deposits. Surfaced in /api/health so
// a drain is caught early instead of silently trapping the APY stale.
const LOW_GAS_CYCLES = 96;

export interface PushResult {
  adapter: string;
  pushed:  boolean;
  txid?:   string;
  reason?: string;
}

export interface OracleGas {
  /** Oracle wallet address (public — it signs set-apy on-chain). */
  address: string;
  /** STX balance in µSTX. */
  ustx: number;
  /** Whole push cycles this balance still affords. */
  runwayCycles: number;
  /** True once runway drops below LOW_GAS_CYCLES — refill signal. */
  lowGas: boolean;
}

interface OracleStatus {
  lastCycleAt: number | null;
  lastResults: PushResult[];
  lastGas: OracleGas[];
  mode: "dual" | "single" | "disabled";
}

let status: OracleStatus = {
  lastCycleAt: null,
  lastResults: [],
  lastGas: [],
  mode: "disabled",
};

export function getOracleStatus(): OracleStatus & { ageSeconds: number | null } {
  return {
    ...status,
    ageSeconds: status.lastCycleAt
      ? Math.round((Date.now() - status.lastCycleAt) / 1000)
      : null,
  };
}

/** Read a wallet's STX balance (µSTX). Null on any error — never throws. */
async function readBalanceUstx(address: string): Promise<number | null> {
  try {
    const res = await fetch(`${STACKS_API_BASE}/v2/accounts/${address}?proof=0`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { balance: string };
    const amount = Number(BigInt(data.balance));
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  } catch {
    return null;
  }
}

/**
 * Read every configured oracle wallet's gas balance and compute remaining
 * runway. This is the early-warning that a wallet is draining: an out-of-gas
 * oracle can't broadcast set-apy, so the on-chain APY goes stale and deposits
 * block — exactly the silent failure this surfaces before it happens.
 */
async function collectOracleGas(): Promise<OracleGas[]> {
  const network = IS_MAINNET ? ("mainnet" as const) : ("testnet" as const);
  const { getAddressFromPrivateKey } = await import("@stacks/transactions");
  const keys = [ORACLE_KEY, ORACLE_KEY_2].filter((k) => k.length > 0);
  const adapterCount = Math.max(1, Object.keys(ADAPTER_REGISTRY).length);
  const perCycleUstx = PER_PUSH_USTX * adapterCount;

  const gas: OracleGas[] = [];
  for (const key of keys) {
    let address: string;
    try {
      address = getAddressFromPrivateKey(key, network);
    } catch {
      continue;
    }
    const ustx = await readBalanceUstx(address);
    if (ustx === null) continue;
    const runwayCycles = Math.floor(ustx / perCycleUstx);
    gas.push({ address, ustx, runwayCycles, lowGas: runwayCycles < LOW_GAS_CYCLES });
  }
  return gas;
}

function sanitize(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\b[0-9a-fA-F]{64,}\b/g, "[redacted]");
}

export async function pushApy(
  contractName: string,
  newBps: number,
  options?: { nonce?: number; senderKey?: string }
): Promise<PushResult> {
  if (!WRITES_ENABLED) return { adapter: contractName, pushed: false, reason: "writes_disabled" };
  if (!(Object.keys(ADAPTER_REGISTRY) as ProtocolId[]).some((p) => adapterName(p) === contractName)) {
    return { adapter: contractName, pushed: false, reason: "unregistered_adapter" };
  }
  if (!Number.isSafeInteger(newBps) || newBps < 0 || newBps > 6000) {
    return { adapter: contractName, pushed: false, reason: "invalid_apy" };
  }
  const key = options?.senderKey ?? ORACLE_KEY;
  if (!DEPLOYER || !key) {
    return { adapter: contractName, pushed: false, reason: "missing_env" };
  }

  // Anchor must be the REAL committed value (stale-tolerant), not get-apy —
  // which errors when stale and would let a push that the on-chain deviation
  // guard rejects (err u109) slip through, wasting a tx and staying stale.
  const currentBps = await readAnchorApyBps(contractName);
  if (currentBps === null) return { adapter: contractName, pushed: false, reason: "anchor_unavailable" };

  if (currentBps > 0 && exceedsDeviation(newBps, currentBps, 50)) {
    console.error(
      `[oracle] deviation too large — ${contractName}: current=${currentBps} new=${newBps}`
    );
    return { adapter: contractName, pushed: false, reason: "deviation_exceeded" };
  }

  const network = IS_MAINNET ? ("mainnet" as const) : ("testnet" as const);

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName,
    functionName:    "set-apy",
    functionArgs:    [uintCV(newBps)],
    senderKey:       key,
    network,
    client: { baseUrl: STACKS_API_BASE },
    nonce: options?.nonce !== undefined ? BigInt(options.nonce) : undefined,
  });

  const result = await broadcastTransaction({ transaction: tx, network, client: { baseUrl: STACKS_API_BASE } });

  if ("error" in result) {
    console.error(`[oracle] broadcast failed for ${contractName}:`, result.error);
    return { adapter: contractName, pushed: false, reason: result.error as string };
  }

  return { adapter: contractName, pushed: true, txid: result.txid };
}

async function fetchNonce(address: string): Promise<number> {
  const res = await fetch(`${STACKS_API_BASE}/extended/v1/address/${address}/nonces`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error("Oracle nonce unavailable");
  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null || !("possible_next_nonce" in data) ||
      typeof data.possible_next_nonce !== "number" ||
      !Number.isSafeInteger(data.possible_next_nonce) || data.possible_next_nonce < 0) {
    throw new Error("Invalid oracle nonce");
  }
  return data.possible_next_nonce;
}

export async function pushAllAdapters(
  newBpsMap: Record<string, number>
): Promise<PushResult[]> {
  const names = (Object.keys(ADAPTER_REGISTRY) as ProtocolId[]).map(adapterName);

  if (!WRITES_ENABLED) return names.map((adapter) => ({ adapter, pushed: false, reason: "writes_disabled" }));

  // Refuse the wrong chain or an unsynced node before signing any transaction.
  const infoRes = await fetch(`${STACKS_API_BASE}/v2/info`, { signal: AbortSignal.timeout(8_000) });
  if (!infoRes.ok) throw new Error("Oracle network identity unavailable");
  const info = await infoRes.json() as { network_id?: unknown; is_fully_synced?: unknown };
  if (info.network_id !== (IS_MAINNET ? 1 : 2147483648) || info.is_fully_synced !== true) {
    throw new Error("Oracle network identity mismatch or node not synced");
  }
  const { getAddressFromPrivateKey } = await import("@stacks/transactions");
  const results: PushResult[] = [];
  const seen = new Set<string>();
  for (const key of [ORACLE_KEY, ORACLE_KEY_2].filter(Boolean)) {
    let nonce: number;
    let address: string;
    try {
      address = getAddressFromPrivateKey(key, chainNetwork.name);
      if (seen.has(address)) throw new Error("Duplicate oracle signer");
      seen.add(address);
      nonce = await fetchNonce(address);
    } catch (err) {
      for (const name of names) results.push({ adapter: name, pushed: false, reason: sanitize(err) });
      continue;
    }
    for (const name of names) {
      const bps = newBpsMap[name];
      if (bps === undefined) {
        results.push({ adapter: name, pushed: false, reason: "fresh_feed_unavailable" });
        continue;
      }
      try {
        const result = await pushApy(name, bps, { nonce, senderKey: key });
        results.push(result);
        if (result.pushed) nonce++;
        // A rejected broadcast must not leave a nonce gap for the next adapter.
      } catch (err) {
        results.push({ adapter: name, pushed: false, reason: sanitize(err) });
        // Broadcast completion may be uncertain. Stop this signer to avoid
        // accidentally reusing a nonce with a different payload.
        break;
      }
    }
  }
  return results;
}

export async function buildBpsMap(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  for (const protocol of Object.keys(ADAPTER_REGISTRY) as ProtocolId[]) {
    const entry = ADAPTER_REGISTRY[protocol];
    const name = adapterName(protocol);
    const [nativeResult, anchorResult] = await Promise.allSettled([
      entry.fetchNativeApy(), readAnchorApyBps(name),
    ]);
    const native = nativeResult.status === "fulfilled" ? nativeResult.value : null;
    const anchor = anchorResult.status === "fulfilled" ? anchorResult.value : null;
    // Neither a reference target nor a stale anchor constitutes a new sample.
    // Feed failure must age out the on-chain oracle instead of freshening it.
    if (native === null || !Number.isFinite(native) || native < 0 || native > 60 ||
        anchor === null || !Number.isSafeInteger(anchor) || anchor < 0 || anchor > 6000) continue;
    const measuredBps = Math.round(native * 100);
    // A large discontinuity requires investigation. Walking synthetic values
    // through the deviation guard labels unobserved APYs as fresh evidence.
    if (exceedsDeviation(measuredBps, anchor, 50)) continue;
    map[name] = measuredBps;
  }
  return map;
}

let cycleRunning = false;

async function runOracleCycle(): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;
  console.log(`[oracle] cycle ${new Date().toISOString()}`);
  try {
    const bpsMap  = await buildBpsMap();
    const results = await pushAllAdapters(bpsMap);
    for (const r of results) {
      r.pushed
        ? console.log(`[oracle] pushed ${r.adapter} txid=${r.txid}`)
        : console.warn(`[oracle] skipped ${r.adapter} reason=${r.reason}`);
    }

    // Read oracle gas AFTER pushing so the warning reflects the post-tx balance.
    const gas = await collectOracleGas();
    for (const g of gas) {
      if (g.lowGas) {
        console.warn(
          `[oracle] LOW GAS ${g.address}: ${g.ustx}uSTX (~${g.runwayCycles} cycles left). ` +
            `Refill STX or set-apy will fail and on-chain APY will go stale.`
        );
      }
    }

    status = { ...status, lastCycleAt: Date.now(), lastResults: results, lastGas: gas };
  } catch (err) {
    console.error("[oracle] cycle error:", sanitize(err));
  } finally {
    cycleRunning = false;
  }
}

export function startOracleScheduler(intervalMs: number): void {
  status.mode = !WRITES_ENABLED || !ORACLE_KEY ? "disabled" : ORACLE_KEY_2 ? "dual" : "single";

  if (!WRITES_ENABLED || !ORACLE_KEY) {
    console.log("[oracle] scheduler disabled; explicit ORACLE_WRITES_ENABLED and signing key required");
    return;
  }
  console.log(`[oracle] scheduler started interval=${Math.round(intervalMs / 60_000)}min`);
  if (ORACLE_KEY_2) {
    console.log("[oracle] dual-oracle mode — 2-of-3 consensus active");
  } else {
    console.warn(
      "[oracle] single-oracle mode — ORACLE_PRIVATE_KEY_2 not set. 2-of-3 consensus " +
        "cannot be reached: on-chain APY goes stale (~5.5h) and deposits get blocked."
    );
  }
  void runOracleCycle();
  setInterval(() => { void runOracleCycle(); }, intervalMs);
}
