import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
} from "@stacks/transactions";
import { readUint, exceedsDeviation } from "./fetchers/chain.js";
import { fetchNativeApys } from "./fetchers/native-apy.js";
import type { NativeApyResult } from "./fetchers/native-apy.js";

const DEPLOYER        = process.env["DEPLOYER_ADDRESS"]     ?? "";
const ORACLE_KEY      = process.env["ORACLE_PRIVATE_KEY"]   ?? "";
const ORACLE_KEY_2    = process.env["ORACLE_PRIVATE_KEY_2"] ?? "";
const IS_MAINNET      = process.env["STACKS_NETWORK"]       === "mainnet";
const STACKS_API_BASE = IS_MAINNET
  ? "https://api.hiro.so"
  : "https://api.testnet.hiro.so";

// On-chain adapter contract name per protocol. Env-overridable so a renamed
// adapter receives the APY push without a code change. MUST match the frontend's
// VITE_*_ADAPTER and the indexer fetchers' *_ADAPTER_NAME so the displayed
// adapter is the one funded.
const ADAPTERS = [
  process.env["ZEST_ADAPTER_NAME"] ?? "zest-earn-adapter",
  process.env["HBTC_ADAPTER_NAME"] ?? "hermetica-hbtc-adapter",
] as const;

type AdapterName = typeof ADAPTERS[number];

// Map each (possibly overridden) adapter name back to its protocol + reference
// rate by position, so overrides need no extra config here.
const PROTOCOL_KEY: Record<string, keyof NativeApyResult> = {
  [ADAPTERS[0]]: "zest",
  [ADAPTERS[1]]: "hbtc",
};

// Reference (bootstrap) APY in bps, used for the displayed on-chain rate until a
// live value or a held on-chain value exists. hBTC has no public APY feed so its
// ~8% target is surfaced as a reference rate in the UI (is_live_integration =
// false) — never presented as live measured data.
const REFERENCE_BPS: Record<string, number> = {
  [ADAPTERS[0]]: 350, // zest - bootstrap for Zest Earn (~3.5% supply yield)
  [ADAPTERS[1]]: 800, // hbtc - reference rate (Hermetica ~8% target)
};

// Max fraction of the current value we move per cycle. Stays inside the 50%
// on-chain deviation guard so a push is never rejected for over-deviating.
const MAX_STEP_PCT = 0.4;

export interface PushResult {
  adapter: string;
  pushed:  boolean;
  txid?:   string;
  reason?: string;
}

interface OracleStatus {
  lastCycleAt: number | null;
  lastResults: PushResult[];
  mode: "dual" | "single" | "disabled";
}

let status: OracleStatus = { lastCycleAt: null, lastResults: [], mode: "disabled" };

export function getOracleStatus(): OracleStatus & { ageSeconds: number | null } {
  return {
    ...status,
    ageSeconds: status.lastCycleAt ? Math.round((Date.now() - status.lastCycleAt) / 1000) : null,
  };
}

/** Strip anything resembling a private key (long hex run) from error text. */
function sanitize(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\b[0-9a-fA-F]{64,}\b/g, "[redacted]");
}

/** Next bps to push: ramp current toward target, capped so we stay within the guard. */
function nextBps(current: number, target: number): number {
  if (current <= 0) return target; // bootstrap (no on-chain value yet)
  const step = Math.max(1, Math.floor(current * MAX_STEP_PCT));
  if (target > current) return Math.min(target, current + step);
  if (target < current) return Math.max(target, current - step);
  return current;
}

export async function pushApy(
  contractName: string,
  newBps: number,
  options?: { nonce?: number; senderKey?: string }
): Promise<PushResult> {
  const key = options?.senderKey ?? ORACLE_KEY;
  if (!DEPLOYER || !key) {
    return { adapter: contractName, pushed: false, reason: "missing_env" };
  }

  let currentBps = 0;
  try {
    currentBps = await readUint(contractName, "get-apy");
  } catch {
    currentBps = 0;
  }

  if (currentBps > 0 && exceedsDeviation(newBps, currentBps, 50)) {
    console.error(`[oracle] deviation too large — ${contractName}: current=${currentBps} new=${newBps}`);
    return { adapter: contractName, pushed: false, reason: "deviation_exceeded" };
  }

  const network = IS_MAINNET ? "mainnet" as const : "testnet" as const;

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName,
    functionName:    "set-apy",
    functionArgs:    [uintCV(newBps)],
    senderKey:       key,
    network,
    nonce: options?.nonce !== undefined ? BigInt(options.nonce) : undefined,
  });

  const result = await broadcastTransaction({ transaction: tx, network });

  if ("error" in result) {
    console.error(`[oracle] broadcast failed for ${contractName}:`, result.error);
    return { adapter: contractName, pushed: false, reason: result.error as string };
  }

  return { adapter: contractName, pushed: true, txid: result.txid };
}

async function fetchNonce(address: string): Promise<number> {
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

  for (const name of ADAPTERS) {
    const bps = newBpsMap[name];
    if (bps === undefined) {
      results.push({ adapter: name, pushed: false, reason: "no_bps_provided" });
      continue;
    }
    // Push from oracle[0]
    try {
      results.push(await pushApy(name, bps, { nonce: n1++ }));
    } catch (err) {
      results.push({ adapter: name, pushed: false, reason: sanitize(err) });
    }
    // Push from oracle[1] when configured — triggers 2-of-3 consensus
    if (ORACLE_KEY_2 && addr2) {
      try {
        const r = await pushApy(name, bps, { nonce: n2++, senderKey: ORACLE_KEY_2 });
        if (!r.pushed) {
          console.warn(`[oracle] oracle-2 push skipped for ${name}: ${r.reason}`);
        }
      } catch (err) {
        console.warn(`[oracle] oracle-2 push failed for ${name}: ${sanitize(err)}`);
      }
    }
  }
  return results;
}

async function buildBpsMap(): Promise<Record<string, number>> {
  const apys = await fetchNativeApys();
  const map: Record<string, number> = {};

  for (const name of ADAPTERS) {
    const protocolKey = PROTOCOL_KEY[name];
    const native = protocolKey ? apys[protocolKey] : null; // percent or null

    let current = 0;
    try { current = await readUint(name, "get-apy"); } catch { /* stale/unset -> 0 */ }

    // Target: live native value when available (zest via DefiLlama); otherwise
    // hold the last-known on-chain value (no drift during a transient outage);
    // bootstrap to the reference rate only when there is nothing on-chain yet
    // (hBTC has no live feed, so it holds at its ~8% reference).
    let target: number;
    if (native !== null) {
      target = Math.round(native * 100);
    } else if (current > 0) {
      target = current; // last-known-good hold — keeps the adapter fresh
    } else {
      target = REFERENCE_BPS[name] ?? 0;
    }

    map[name] = nextBps(current, target);
  }
  return map;
}

async function runOracleCycle(): Promise<void> {
  console.log(`[oracle] cycle ${new Date().toISOString()}`);
  try {
    const bpsMap  = await buildBpsMap();
    const results = await pushAllAdapters(bpsMap);
    for (const r of results) {
      r.pushed
        ? console.log(`[oracle] pushed ${r.adapter} txid=${r.txid}`)
        : console.warn(`[oracle] skipped ${r.adapter} reason=${r.reason}`);
    }
    status = { ...status, lastCycleAt: Date.now(), lastResults: results };
  } catch (err) {
    console.error("[oracle] cycle error:", sanitize(err));
  }
}

export function startOracleScheduler(intervalMs: number): void {
  status.mode = !ORACLE_KEY ? "disabled" : ORACLE_KEY_2 ? "dual" : "single";

  if (!ORACLE_KEY) {
    console.log("[oracle] ORACLE_PRIVATE_KEY not set — scheduler disabled");
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
