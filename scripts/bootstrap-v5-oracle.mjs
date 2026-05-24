#!/usr/bin/env node
/**
 * Bootstrap 2-of-3 oracle consensus on all 4 v5 adapters using only oracle-0's key.
 *
 * Per adapter (5 txs × 4 adapters = 20 txs total):
 *   1. set-oracle-at(1, DEPLOYER)       put oracle-0 in slot 1 (overwrite real oracle-1)
 *   2. set-oracle-at(0, BURN)           remove oracle-0 from slot 0
 *   3. set-apy(bps)                     oracle-0 matches slot 1 → live1=true
 *   4. set-oracle-at(0, DEPLOYER)       restore oracle-0 to slot 0
 *   5. set-apy(bps)                     oracle-0 matches slot 0 → live0=true → consensus!
 *   6. set-oracle-at(1, ORACLE1_ADDR)   restore real oracle-1 for future dual-oracle pushes
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const {
  makeContractCall,
  standardPrincipalCV,
  uintCV,
  serializeTransaction,
  AnchorMode,
  PostConditionMode,
} = require("./node_modules/@stacks/transactions");
const { STACKS_TESTNET } = require("./node_modules/@stacks/network");

const DEPLOYER    = "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const ORACLE1     = "STHQY7550AH33T5XZJ8YCB5EDSPHCHGM481KEGZT"; // restore after bootstrap
const PRIVATE_KEY = "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const BURN_ADDR   = "SP000000000000000000002Q6VF78"; // nobody owns this
const BASE        = "https://api.testnet.hiro.so";
const network     = STACKS_TESTNET;

const ADAPTERS = [
  { name: "bitflow-adapter-v5", bps: 320 },
  { name: "alex-adapter-v5",    bps: 510 },
  { name: "zest-adapter-v5",    bps: 280 },
  { name: "velar-adapter-v5",   bps: 440 },
];

async function getNonce() {
  const r = await fetch(`${BASE}/extended/v1/address/${DEPLOYER}/nonces`);
  const d = await r.json();
  return d.possible_next_nonce ?? d.nonce ?? 0;
}

async function waitForTx(txid) {
  process.stdout.write(" waiting");
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    const r = await fetch(`${BASE}/extended/v1/tx/${txid}`);
    if (r.ok) {
      const d = await r.json();
      if (d.tx_status === "success") { process.stdout.write(" ✓\n"); return; }
      if (d.tx_status?.startsWith("abort")) throw new Error(`abort: ${d.tx_result?.repr}`);
    }
    process.stdout.write(".");
  }
  throw new Error(`${txid} timed out`);
}

async function broadcast(contractName, functionName, functionArgs, nonce) {
  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs,
    senderKey:         PRIVATE_KEY,
    network,
    nonce:             BigInt(nonce),
    anchorMode:        AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee:               10_000n,
  });
  const hexString = serializeTransaction(tx);
  const res = await fetch(`${BASE}/v2/transactions`, {
    method:  "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body:    Buffer.from(hexString, "hex"),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`broadcast failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log("\n-- Bootstrap v5 oracle consensus --\n");

  let nonce = await getNonce();
  console.log(`Starting nonce: ${nonce}\n`);

  for (const { name, bps } of ADAPTERS) {
    console.log(`${name} (target ${bps} bps):`);

    // Step 1: put oracle-0 (DEPLOYER) in slot 1 so is-oracle() passes for slot 1
    process.stdout.write(`  [1/6] set-oracle-at(1, DEPLOYER)...`);
    const t1 = await broadcast(name, "set-oracle-at", [uintCV(1), standardPrincipalCV(DEPLOYER)], nonce++);
    await waitForTx(t1);

    // Step 2: remove oracle-0 from slot 0 so oracle-index-of() maps it to slot 1
    process.stdout.write(`  [2/6] set-oracle-at(0, BURN)...`);
    const t2 = await broadcast(name, "set-oracle-at", [uintCV(0), standardPrincipalCV(BURN_ADDR)], nonce++);
    await waitForTx(t2);

    // Step 3: push APY — oracle-0 now maps to slot 1 → oracle_reports[1]=bps, live1=true
    process.stdout.write(`  [3/6] set-apy(${bps}) → slot 1...`);
    const t3 = await broadcast(name, "set-apy", [uintCV(bps)], nonce++);
    await waitForTx(t3);

    // Step 4: restore oracle-0 to slot 0
    process.stdout.write(`  [4/6] set-oracle-at(0, DEPLOYER)...`);
    const t4 = await broadcast(name, "set-oracle-at", [uintCV(0), standardPrincipalCV(DEPLOYER)], nonce++);
    await waitForTx(t4);

    // Step 5: push APY again — oracle-0 maps to slot 0 → oracle_reports[0]=bps, live0=true → CONSENSUS
    process.stdout.write(`  [5/6] set-apy(${bps}) → slot 0 + consensus...`);
    const t5 = await broadcast(name, "set-apy", [uintCV(bps)], nonce++);
    await waitForTx(t5);

    // Step 6: restore real oracle-1 to slot 1 for ongoing dual-oracle pushes
    process.stdout.write(`  [6/6] set-oracle-at(1, ${ORACLE1})...`);
    const t6 = await broadcast(name, "set-oracle-at", [uintCV(1), standardPrincipalCV(ORACLE1)], nonce++);
    await waitForTx(t6);

    console.log(`  ${name} consensus formed ✓\n`);
  }

  console.log("All 4 v5 adapters have fresh oracle consensus.");
  console.log("Deposits are now unblocked on v5 adapters.\n");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
