#!/usr/bin/env node
/**
 * Tests admin functions: pause, unpause, TVL cap on vault-v3
 */

import {
  makeContractCall,
  uintCV,
  boolCV,
  contractPrincipalCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

const DEPLOYER    = "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const PRIVATE_KEY = "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const NETWORK     = STACKS_TESTNET;
const BASE        = NETWORK.client.baseUrl;

async function getNonce(addr) {
  const r = await fetch(`${BASE}/v2/accounts/${addr}?proof=0`);
  return (await r.json()).nonce;
}

async function broadcast(opts, label, nonce) {
  process.stdout.write(`  tx ${label}... `);
  const tx = await makeContractCall({
    ...opts, senderKey: PRIVATE_KEY, network: NETWORK,
    nonce: BigInt(nonce), anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow, fee: 3000,
  });
  const res = await broadcastTransaction({ transaction: tx, network: NETWORK });
  if (res.error) throw new Error(`${label}: ${res.error}`);
  console.log(`txid ${res.txid}`);
  return res.txid;
}

async function waitForTx(txid, label) {
  process.stdout.write(`  [${label}]`);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    process.stdout.write(".");
    const r = await fetch(`${BASE}/extended/v1/tx/${txid}`);
    if (r.ok) {
      const d = await r.json();
      if (d.tx_status === "success") { console.log(" ✓"); return; }
      if (d.tx_status?.startsWith("abort")) {
        console.log(` ✗  ${d.tx_result?.repr ?? d.tx_status}`);
        throw new Error(`${label} aborted`);
      }
    }
  }
  throw new Error(`${label} timed out`);
}

async function main() {
  console.log("\n── Admin function tests ─────────────────────────────────────────");
  let nonce = await getNonce(DEPLOYER);

  // Pause bitflow-adapter-v2
  console.log("\n1. Pause bitflow-adapter-v2");
  const pauseTx = await broadcast({
    contractAddress: DEPLOYER, contractName: "bitflow-adapter-v2",
    functionName: "set-paused", functionArgs: [boolCV(true)],
  }, "bitflow-v2.set-paused(true)", nonce++);
  await waitForTx(pauseTx, "pause");

  // Check is-paused
  const pauseCheck = await fetch(
    `${BASE}/v2/contracts/call-read/${DEPLOYER}/bitflow-adapter-v2/is-paused`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: DEPLOYER, arguments: [] }) }
  );
  const pauseData = await pauseCheck.json();
  const isPaused = pauseData.result?.includes("true") || pauseData.result?.endsWith("03");
  console.log(`  is-paused: ${isPaused ? "true ✓" : "false ✗"} (raw: ${pauseData.result})`);

  // Unpause
  console.log("\n2. Unpause bitflow-adapter-v2");
  const unpauseTx = await broadcast({
    contractAddress: DEPLOYER, contractName: "bitflow-adapter-v2",
    functionName: "set-paused", functionArgs: [boolCV(false)],
  }, "bitflow-v2.set-paused(false)", nonce++);
  await waitForTx(unpauseTx, "unpause");

  // Set TVL cap on vault-v3 to 50 sBTC (5_000_000_000 sats)
  console.log("\n3. Set vault-v3 TVL cap to 50 sBTC (5,000,000,000 sats)");
  const capTx = await broadcast({
    contractAddress: DEPLOYER, contractName: "vault-v3",
    functionName: "set-tvl-cap", functionArgs: [uintCV(5_000_000_000)],
  }, "vault-v3.set-tvl-cap(5e9)", nonce++);
  await waitForTx(capTx, "tvl-cap");
  console.log("  ✓ TVL cap updated");

  // Pause entire vault
  console.log("\n4. Global pause vault-v3");
  const globalPauseTx = await broadcast({
    contractAddress: DEPLOYER, contractName: "vault-v3",
    functionName: "set-global-paused", functionArgs: [boolCV(true)],
  }, "vault-v3.set-global-paused(true)", nonce++);
  await waitForTx(globalPauseTx, "global-pause");

  // Unpause vault
  const globalUnpauseTx = await broadcast({
    contractAddress: DEPLOYER, contractName: "vault-v3",
    functionName: "set-global-paused", functionArgs: [boolCV(false)],
  }, "vault-v3.set-global-paused(false)", nonce++);
  await waitForTx(globalUnpauseTx, "global-unpause");
  console.log("  ✓ Global pause/unpause cycle complete");

  console.log("\n── Admin tests complete ─────────────────────────────────────────");
}

main().catch(err => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
