/**
 * Oracle pusher — fetches live APY from native protocol APIs and broadcasts
 * set-apy transactions to each adapter on a configurable schedule.
 *
 * Consensus happens on-chain: APY commits only when 2 of the 3 registered
 * oracle principals report values within ±10% of each other. Run multiple
 * instances (each with a different ORACLE_PRIVATE_KEY) for full quorum.
 *
 * Required env vars:
 *   DEPLOYER_ADDRESS   — contract deployer principal (ST... / SP...)
 *   ORACLE_PRIVATE_KEY — secp256k1 private key hex (64 chars) for this instance
 *   STACKS_API_URL     — Stacks node RPC base URL
 *   STACKS_NETWORK     — "testnet" | "mainnet"
 */

import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
} from "@stacks/transactions";
import { readUint, exceedsDeviation } from "./fetchers/chain.js";
import { fetchNativeApys } from "./fetchers/native-apy.js";

const DEPLOYER   = process.env["DEPLOYER_ADDRESS"]   ?? "";
const ORACLE_KEY = process.env["ORACLE_PRIVATE_KEY"] ?? "";
const IS_MAINNET = process.env["STACKS_NETWORK"]     === "mainnet";

const ADAPTERS = [
  "alex-adapter",
  "bitflow-adapter",
  "zest-adapter",
  "velar-adapter",
] as const;

export interface PushResult {
  adapter: string;
  pushed:  boolean;
  txid?:   string;
  reason?: string;
}

/**
 * Push a new APY value to one adapter.
 * Pre-flight: reads current on-chain APY and rejects if deviation >50%.
 */
export async function pushApy(
  contractName: string,
  newBps: number
): Promise<PushResult> {
  if (!DEPLOYER || !ORACLE_KEY) {
    return { adapter: contractName, pushed: false, reason: "missing_env" };
  }

  // Pre-flight deviation check against current on-chain value
  let currentBps = 0;
  try {
    currentBps = await readUint(contractName, "get-apy");
  } catch {
    currentBps = 0; // stale or unset — allow push
  }

  if (currentBps > 0 && exceedsDeviation(newBps, currentBps, 50)) {
    console.error(
      `[oracle] ALERT deviation too large — ${contractName}: ` +
      `current=${currentBps}bps new=${newBps}bps — skipping push`
    );
    return { adapter: contractName, pushed: false, reason: "deviation_exceeded" };
  }

  // v7: network is passed as a StacksNetworkName string. The library resolves
  // "testnet" → https://api.testnet.hiro.so and "mainnet" → https://api.hiro.so.
  // STACKS_API_URL is honored by chain.ts for read calls; broadcast uses the
  // default Hiro endpoint which is the authoritative mempool entry point.
  const networkName = IS_MAINNET ? "mainnet" as const : "testnet" as const;

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName,
    functionName: "set-apy",
    functionArgs: [uintCV(newBps)],
    senderKey: ORACLE_KEY,
    network: networkName,
  });

  const result = await broadcastTransaction({ transaction: tx, network: networkName });

  if ("error" in result) {
    console.error(`[oracle] broadcast failed for ${contractName}:`, result.error);
    return { adapter: contractName, pushed: false, reason: result.error as string };
  }

  return { adapter: contractName, pushed: true, txid: result.txid };
}

/**
 * Push APY to all 4 adapters. newBpsMap maps adapter name → bps value.
 * Adapters missing from the map are skipped.
 */
export async function pushAllAdapters(
  newBpsMap: Record<string, number>
): Promise<PushResult[]> {
  const results = await Promise.allSettled(
    ADAPTERS.map((name) => {
      const bps = newBpsMap[name];
      if (bps === undefined) {
        return Promise.resolve<PushResult>({
          adapter: name,
          pushed: false,
          reason: "no_bps_provided",
        });
      }
      return pushApy(name, bps);
    })
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { adapter: ADAPTERS[i]!, pushed: false, reason: String(r.reason) }
  );
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Convert native API APY decimals (e.g. 0.22 = 22%) to basis points (2200).
 * Returns only protocols for which a value was successfully fetched.
 */
async function buildBpsMap(): Promise<Record<string, number>> {
  const apys = await fetchNativeApys();
  const map: Record<string, number> = {};
  if (apys.bitflow !== null) map["bitflow-adapter"] = Math.round(apys.bitflow * 100);
  if (apys.alex    !== null) map["alex-adapter"]    = Math.round(apys.alex    * 100);
  if (apys.zest    !== null) map["zest-adapter"]    = Math.round(apys.zest    * 100);
  if (apys.velar   !== null) map["velar-adapter"]   = Math.round(apys.velar   * 100);
  return map;
}

/** Run one full oracle cycle: fetch native APYs → convert → push to chain. */
async function runOracleCycle(): Promise<void> {
  console.log(`[oracle] cycle start ${new Date().toISOString()}`);
  try {
    const bpsMap = await buildBpsMap();
    const fetched = Object.keys(bpsMap).length;
    if (fetched === 0) {
      console.warn("[oracle] no native APYs fetched — skipping push");
      return;
    }

    const results = await pushAllAdapters(bpsMap);
    for (const r of results) {
      if (r.pushed) {
        console.log(`[oracle] ✓ pushed ${r.adapter} txid=${r.txid}`);
      } else {
        console.warn(`[oracle] ✗ skipped ${r.adapter} reason=${r.reason}`);
      }
    }
  } catch (err) {
    console.error("[oracle] cycle error:", (err as Error).message);
  }
}

/**
 * Start the oracle scheduler.
 * No-ops silently if ORACLE_PRIVATE_KEY is not set, so deployments without
 * oracle credentials are completely unaffected.
 */
export function startOracleScheduler(intervalMs: number): void {
  if (!ORACLE_KEY) {
    console.log("[oracle] ORACLE_PRIVATE_KEY not set — scheduler disabled");
    return;
  }
  console.log(`[oracle] scheduler started, interval=${intervalMs / 60_000}min`);
  void runOracleCycle();                               // fire immediately on boot
  setInterval(() => { void runOracleCycle(); }, intervalMs);
}
