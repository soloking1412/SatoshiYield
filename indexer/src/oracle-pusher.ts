import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
} from "@stacks/transactions";
import { readUint, exceedsDeviation } from "./fetchers/chain.js";
import { fetchNativeApys } from "./fetchers/native-apy.js";
import type { NativeApyResult } from "./fetchers/native-apy.js";

const DEPLOYER        = process.env["DEPLOYER_ADDRESS"]   ?? "";
const ORACLE_KEY      = process.env["ORACLE_PRIVATE_KEY"] ?? "";
const IS_MAINNET      = process.env["STACKS_NETWORK"]     === "mainnet";
const STACKS_API_BASE = IS_MAINNET
  ? "https://api.hiro.so"
  : "https://api.testnet.hiro.so";

const ADAPTERS = [
  "alex-adapter-v3",
  "bitflow-adapter-v3",
  "zest-adapter-v3",
  "velar-adapter-v3",
] as const;

type AdapterName = typeof ADAPTERS[number];

const PROTOCOL_KEY: Record<AdapterName, keyof NativeApyResult> = {
  "alex-adapter-v3":    "alex",
  "bitflow-adapter-v3": "bitflow",
  "zest-adapter-v3":    "zest",
  "velar-adapter-v3":   "velar",
};

const TARGET_BPS: Record<AdapterName, number> = {
  "bitflow-adapter-v3": 320,
  "alex-adapter-v3":    510,
  "zest-adapter-v3":    280,
  "velar-adapter-v3":   440,
};

export interface PushResult {
  adapter: string;
  pushed:  boolean;
  txid?:   string;
  reason?: string;
}

export async function pushApy(
  contractName: string,
  newBps: number,
  options?: { nonce?: number }
): Promise<PushResult> {
  if (!DEPLOYER || !ORACLE_KEY) {
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
    senderKey:       ORACLE_KEY,
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

export async function pushAllAdapters(
  newBpsMap: Record<string, number>
): Promise<PushResult[]> {
  let baseNonce = 0;
  try {
    const res  = await fetch(`${STACKS_API_BASE}/v2/accounts/${DEPLOYER}?proof=0`);
    const data = await res.json() as { nonce: number };
    baseNonce  = data.nonce;
  } catch {
    console.warn("[oracle] could not fetch nonce — falling back to auto-nonce");
  }

  const results: PushResult[] = [];
  let nonce = baseNonce;

  for (const name of ADAPTERS) {
    const bps = newBpsMap[name];
    if (bps === undefined) {
      results.push({ adapter: name, pushed: false, reason: "no_bps_provided" });
      continue;
    }
    try {
      results.push(await pushApy(name, bps, { nonce: nonce++ }));
    } catch (err) {
      results.push({ adapter: name, pushed: false, reason: String(err) });
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
    const target      = TARGET_BPS[name];

    if (native !== null) {
      map[name] = Math.round(native * 100);
      continue;
    }

    let current = 0;
    try { current = await readUint(name, "get-apy"); } catch { /* unset */ }

    if (current === 0 || current === target) {
      map[name] = target;
    } else {
      // Move at most 40% of current per cycle — stays within the 50% on-chain deviation guard
      const step = Math.floor(current * 0.4);
      map[name]  = target > current
        ? Math.min(target, current + step)
        : Math.max(target, current - step);
    }
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
  } catch (err) {
    console.error("[oracle] cycle error:", (err as Error).message);
  }
}

export function startOracleScheduler(intervalMs: number): void {
  if (!ORACLE_KEY) {
    console.log("[oracle] ORACLE_PRIVATE_KEY not set — scheduler disabled");
    return;
  }
  console.log(`[oracle] scheduler started interval=${intervalMs / 60_000}min`);
  void runOracleCycle();
  setInterval(() => { void runOracleCycle(); }, intervalMs);
}
