import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
} from "@stacks/transactions";
import { readUint, exceedsDeviation, readOracleReportBps } from "./fetchers/chain.js";
import { fetchNativeApys } from "./fetchers/native-apy.js";
import type { NativeApyResult } from "./fetchers/native-apy.js";

const DEPLOYER        = process.env["DEPLOYER_ADDRESS"]    ?? "";
const ORACLE_KEY      = process.env["ORACLE_PRIVATE_KEY"]  ?? "";
const ORACLE_KEY_2    = process.env["ORACLE_PRIVATE_KEY_2"] ?? "";
const IS_MAINNET      = process.env["STACKS_NETWORK"]      === "mainnet";
const STACKS_API_BASE = IS_MAINNET
  ? "https://api.hiro.so"
  : "https://api.testnet.hiro.so";

const ADAPTERS = [
  "alex-adapter-v4",
  "bitflow-adapter-v4",
  "zest-adapter-v4",
  "velar-adapter-v4",
] as const;

type AdapterName = typeof ADAPTERS[number];

const PROTOCOL_KEY: Record<AdapterName, keyof NativeApyResult> = {
  "alex-adapter-v4":    "alex",
  "bitflow-adapter-v4": "bitflow",
  "zest-adapter-v4":    "zest",
  "velar-adapter-v4":   "velar",
};

const TARGET_BPS: Record<AdapterName, number> = {
  "bitflow-adapter-v4": 320,
  "alex-adapter-v4":    510,
  "zest-adapter-v4":    280,
  "velar-adapter-v4":   440,
};

export interface PushResult {
  adapter: string;
  oracle:  0 | 1;
  pushed:  boolean;
  txid?:   string;
  reason?: string;
}

/** Strip anything resembling a private key (long hex run) from error text. */
function sanitize(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\b[0-9a-fA-F]{64,}\b/g, "[redacted]");
}

export async function pushApy(
  contractName: string,
  newBps: number,
  options?: { nonce?: number; senderKey?: string; oracleIdx?: 0 | 1 }
): Promise<PushResult> {
  const oracleIdx = options?.oracleIdx ?? 0;
  const key       = options?.senderKey ?? ORACLE_KEY;
  if (!DEPLOYER || !key) {
    return { adapter: contractName, oracle: oracleIdx, pushed: false, reason: "missing_env" };
  }

  let currentBps = 0;
  try {
    currentBps = await readUint(contractName, "get-apy");
  } catch {
    currentBps = 0;
  }

  if (currentBps > 0 && exceedsDeviation(newBps, currentBps, 50)) {
    console.error(`[oracle] deviation too large — ${contractName}: current=${currentBps} new=${newBps}`);
    return { adapter: contractName, oracle: oracleIdx, pushed: false, reason: "deviation_exceeded" };
  }

  const network = IS_MAINNET ? "mainnet" as const : "testnet" as const;

  // Hard-set the fee so makeContractCall doesn't call Hiro's /v2/fees/transaction —
  // that endpoint is aggressively rate-limited and was 429'ing whole cycles. set-apy
  // is a small contract call; 10_000 uSTX (0.01 STX) is plenty for inclusion.
  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName,
    functionName:    "set-apy",
    functionArgs:    [uintCV(newBps)],
    senderKey:       key,
    network,
    fee:             10_000n,
    nonce: options?.nonce !== undefined ? BigInt(options.nonce) : undefined,
  });

  const result = await broadcastTransaction({ transaction: tx, network });

  if ("error" in result) {
    // broadcastTransaction returns { error, reason?, reason_data? }. The top-level
    // "error" is generic ("transaction rejected"); the "reason" is the actionable
    // detail (e.g. "BadNonce") and we need it in logs to debug rejections.
    const r = result as { error: string; reason?: string; reason_data?: unknown };
    const detail = r.reason
      ? `${r.error}: ${r.reason}${r.reason_data ? " " + JSON.stringify(r.reason_data) : ""}`
      : r.error;
    console.error(`[oracle] broadcast failed for ${contractName}:`, detail);
    return { adapter: contractName, oracle: oracleIdx, pushed: false, reason: detail };
  }

  return { adapter: contractName, oracle: oracleIdx, pushed: true, txid: result.txid };
}

/**
 * Returns the next nonce that's safe to use, accounting for any pending
 * mempool transactions the address has in flight. Critical for oracle pushes:
 * if a previous cycle's tx is still pending and we reuse the executed-nonce,
 * the new tx is rejected as BadNonce. Hiro's /extended/v1/.../nonces gives us
 * `possible_next_nonce = max(last_executed+1, max(mempool_nonces)+1)`.
 */
async function fetchNonce(address: string): Promise<number> {
  try {
    const res = await fetch(
      `${STACKS_API_BASE}/extended/v1/address/${address}/nonces`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (res.ok) {
      const data = await res.json() as { possible_next_nonce?: number };
      if (typeof data.possible_next_nonce === "number") {
        return data.possible_next_nonce;
      }
    }
  } catch { /* fall through */ }

  // Fallback: executed-only nonce. Used if extended/v1 is down — better than
  // crashing the cycle, but pending txs may cause BadNonce until they mine.
  try {
    const res  = await fetch(`${STACKS_API_BASE}/v2/accounts/${address}?proof=0`);
    const data = await res.json() as { nonce: number };
    return data.nonce;
  } catch {
    return 0;
  }
}

export async function pushAllAdapters(
  newBpsMap: Record<string, number>
): Promise<PushResult[]> {
  const nonce1 = await fetchNonce(DEPLOYER);
  let n1 = nonce1;

  // If a second oracle key is configured, fetch its nonce too.
  // Resolve the address from the key to get the right account nonce.
  let n2 = 0;
  let addr2 = "";
  if (ORACLE_KEY_2) {
    try {
      const { getAddressFromPrivateKey } = await import("@stacks/transactions");
      addr2 = getAddressFromPrivateKey(ORACLE_KEY_2, IS_MAINNET ? "mainnet" : "testnet");
      n2    = await fetchNonce(addr2);
    } catch {
      console.warn("[oracle] could not resolve oracle-2 address — skipping second oracle");
    }
  }

  const results: PushResult[] = [];
  // Small delay between broadcasts so we don't burst Hiro's per-second limits.
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const name of ADAPTERS) {
    const bps = newBpsMap[name];
    if (bps === undefined) {
      results.push({ adapter: name, oracle: 0, pushed: false, reason: "no_bps_provided" });
      continue;
    }

    // Push from oracle[0]. Only advance the nonce on success — a rejected tx
    // doesn't consume one on-chain, and bumping locally would skip the slot
    // and cause every subsequent push to BadNonce.
    try {
      const r0 = await pushApy(name, bps, { nonce: n1, oracleIdx: 0 });
      results.push(r0);
      if (r0.pushed) n1++;
    } catch (err) {
      results.push({ adapter: name, oracle: 0, pushed: false, reason: sanitize(err) });
    }
    await wait(300);

    // Push from oracle[1] when configured — required to reach 2-of-3 consensus.
    if (ORACLE_KEY_2 && addr2) {
      try {
        const r1 = await pushApy(name, bps, { nonce: n2, senderKey: ORACLE_KEY_2, oracleIdx: 1 });
        results.push(r1);
        if (r1.pushed) n2++;
        if (!r1.pushed) console.warn(`[oracle] oracle-2 push skipped for ${name}: ${r1.reason}`);
      } catch (err) {
        results.push({ adapter: name, oracle: 1, pushed: false, reason: sanitize(err) });
        console.warn(`[oracle] oracle-2 push failed for ${name}: ${sanitize(err)}`);
      }
      await wait(300);
    }
  }
  return results;
}

async function buildBpsMap(): Promise<Record<string, number>> {
  const apys = await fetchNativeApys();
  const map: Record<string, number> = {};

  for (const name of ADAPTERS) {
    const protocolKey = PROTOCOL_KEY[name];
    const native      = apys[protocolKey];
    const fallback    = TARGET_BPS[name];

    // Desired target: live native APY when the protocol API responded, else
    // the curated fallback. Either way, we must respect the on-chain ±50%
    // deviation guard against the *committed* current-apy-bps below.
    const target = native !== null ? Math.round(native * 100) : fallback;

    // Baseline for the ramp. Prefer fresh on-chain APY. If get-apy is stale
    // (throws err-stale-apy), we can't see current-apy-bps directly — but the
    // contract's deviation guard still compares against it. Slot 0's report
    // alone is unsafe: oracle-0 may have advanced it via a tx whose try-commit
    // didn't reach consensus, in which case current-apy-bps did NOT change
    // and slot 0 now overshoots.
    //
    // Use min(slot-0, slot-1) instead. Whichever oracle has been failing keeps
    // its slot pinned to the value at the last successful commit (== current-
    // apy-bps), so min is always ≤ current-apy-bps. That keeps the ramp inside
    // the ±50% deviation guard while still moving the baseline forward each
    // cycle a successful commit lands.
    let baseline = 0;
    try {
      baseline = await readUint(name, "get-apy");
    } catch {
      const [r0, r1] = await Promise.allSettled([
        readOracleReportBps(name, 0),
        readOracleReportBps(name, 1),
      ]);
      const v0 = r0.status === "fulfilled" ? r0.value : 0;
      const v1 = r1.status === "fulfilled" ? r1.value : 0;
      // If only one slot has ever reported, use it. Otherwise the lower of the
      // two — that's the safe proxy for current-apy-bps.
      baseline = v0 > 0 && v1 > 0 ? Math.min(v0, v1) : Math.max(v0, v1);
    }

    if (baseline === 0 || baseline === target) {
      map[name] = target;
    } else {
      // Move at most 40% of baseline per cycle — stays inside the 50%
      // on-chain deviation guard with margin for rounding.
      const step = Math.floor(baseline * 0.4);
      map[name]  = target > baseline
        ? Math.min(target, baseline + step)
        : Math.max(target, baseline - step);
    }
  }
  return map;
}

// Process-wide mutex: prevents the in-process 6h scheduler and the external
// cron's POST /api/oracle/push from running concurrently. Without it, both
// callers fetch the same possible_next_nonce, race their broadcasts, and most
// of the second cycle's txs fail with BadNonce while half push wrong bps
// because the baseline read happens against in-flight state from the other.
let cycleInProgress = false;

export async function runOracleCycle(): Promise<PushResult[]> {
  if (cycleInProgress) {
    console.warn("[oracle] cycle already in progress — skipping");
    return [{ adapter: "cycle", oracle: 0, pushed: false, reason: "concurrent_cycle_skipped" }];
  }
  cycleInProgress = true;
  console.log(`[oracle] cycle ${new Date().toISOString()}`);
  try {
    const bpsMap  = await buildBpsMap();
    const results = await pushAllAdapters(bpsMap);
    for (const r of results) {
      r.pushed
        ? console.log(`[oracle] pushed ${r.adapter} txid=${r.txid}`)
        : console.warn(`[oracle] skipped ${r.adapter} reason=${r.reason}`);
    }
    return results;
  } catch (err) {
    console.error("[oracle] cycle error:", sanitize(err));
    return [{ adapter: "cycle", oracle: 0, pushed: false, reason: sanitize(err) }];
  } finally {
    cycleInProgress = false;
  }
}

export function startOracleScheduler(intervalMs: number): void {
  if (!ORACLE_KEY) {
    console.log("[oracle] ORACLE_PRIVATE_KEY not set — scheduler disabled");
    return;
  }
  console.log(`[oracle] in-process scheduler interval=${intervalMs / 60_000}min (fallback; primary driver is external cron via /api/oracle/push)`);
  if (ORACLE_KEY_2) {
    console.log("[oracle] dual-oracle mode — 2-of-3 consensus active");
  } else {
    console.warn(
      "[oracle] single-oracle mode — ORACLE_PRIVATE_KEY_2 not set. 2-of-3 consensus " +
        "cannot be reached: on-chain APY goes stale after 720 blocks and deposits get blocked."
    );
  }
  // No boot-time cycle: it races with the external cron whenever Render
  // redeploys. The 6h interval below + the external cron's 30-min cadence
  // keep oracles fresh without needing an immediate kick.
  setInterval(() => { void runOracleCycle(); }, intervalMs);
}
