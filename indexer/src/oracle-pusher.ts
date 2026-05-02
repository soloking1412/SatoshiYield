/**
 * Oracle pusher — broadcasts set-apy transactions to each adapter.
 *
 * Run 3 independent instances (one per ORACLE_PRIVATE_KEY) on a cron
 * schedule (e.g. every 2 hours). Consensus happens on-chain: APY commits
 * only when 2 of the 3 instances agree within ±10%.
 *
 * Required env vars:
 *   DEPLOYER_ADDRESS      — contract deployer principal
 *   ORACLE_PRIVATE_KEY    — secp256k1 private key (hex) for this instance
 *   STACKS_API_URL        — Stacks node RPC base URL
 *   STACKS_NETWORK        — "testnet" | "mainnet"
 *
 * Install before running:
 *   npm install @stacks/transactions
 */

import { readUint, exceedsDeviation } from "./fetchers/chain.js";

const DEPLOYER = process.env["DEPLOYER_ADDRESS"] ?? "";
const ORACLE_KEY = process.env["ORACLE_PRIVATE_KEY"] ?? "";
const STACKS_API = process.env["STACKS_API_URL"] ?? "https://api.testnet.hiro.so";
const IS_MAINNET = process.env["STACKS_NETWORK"] === "mainnet";

const ADAPTERS = [
  "alex-adapter",
  "bitflow-adapter",
  "zest-adapter",
  "velar-adapter",
] as const;

export interface PushResult {
  adapter: string;
  pushed: boolean;
  txid?: string;
  reason?: string;
}

/**
 * Push a new APY value to one adapter.
 * Pre-flight: reads current on-chain APY and rejects if deviation >50%.
 * Dynamically imports @stacks/transactions so the indexer server itself
 * does not need that package installed.
 */
export async function pushApy(
  contractName: string,
  newBps: number
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
    console.error(
      `[oracle-pusher] ALERT deviation too large — ${contractName}: ` +
      `current=${currentBps}bps new=${newBps}bps — skipping push`
    );
    return { adapter: contractName, pushed: false, reason: "deviation_exceeded" };
  }

  // Dynamic import so @stacks/transactions is optional at build time
  const { makeContractCall, broadcastTransaction, uintCV, AnchorMode, StacksTestnet, StacksMainnet } =
    await import("@stacks/transactions" as string);

  const network = IS_MAINNET ? new StacksMainnet() : new StacksTestnet();

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName,
    functionName: "set-apy",
    functionArgs: [uintCV(newBps)],
    senderKey: ORACLE_KEY,
    anchorMode: AnchorMode.Any,
    network,
  });

  const result = await broadcastTransaction({ transaction: tx, url: STACKS_API });

  if ("error" in result) {
    console.error(`[oracle-pusher] broadcast failed for ${contractName}:`, result.error);
    return { adapter: contractName, pushed: false, reason: result.error as string };
  }

  console.log(`[oracle-pusher] pushed ${newBps}bps to ${contractName}: txid=${result.txid}`);
  return { adapter: contractName, pushed: true, txid: result.txid };
}

/**
 * Push APY to all 4 adapters. newBpsMap maps adapter name → bps value.
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
