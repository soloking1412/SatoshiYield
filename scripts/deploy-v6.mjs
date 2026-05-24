#!/usr/bin/env node
/**
 * Deploy the 4 yield-accrual adapters (v5) to testnet.
 * Uses raw fetch broadcast to avoid @stacks/transactions v7 broadcastTransaction bug.
 */

import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const {
  makeContractDeploy,
  serializeTransaction,
  AnchorMode,
  PostConditionMode,
} = require("./node_modules/@stacks/transactions");
const { STACKS_TESTNET } = require("./node_modules/@stacks/network");

const DEPLOYER    = "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
// No "0x" prefix — serializeTransaction in v7 handles raw hex key
const PRIVATE_KEY = "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const network     = STACKS_TESTNET;
const BASE_URL    = "https://api.testnet.hiro.so";

const CONTRACTS = [
  // bitflow-adapter-v5 already deployed at nonce 410 (txid 54c570dac4bfb883dc03edd3e300517a0d1b68861ea0f62c3fbac3d81373dd84)
  { name: "alex-adapter-v5",    path: "../contracts/contracts/adapters/alex-adapter-v5.clar"    },
  { name: "zest-adapter-v5",    path: "../contracts/contracts/adapters/zest-adapter-v5.clar"    },
  { name: "velar-adapter-v5",   path: "../contracts/contracts/adapters/velar-adapter-v5.clar"   },
];

async function getNonce() {
  const res  = await fetch(`${BASE_URL}/extended/v1/address/${DEPLOYER}/nonces`);
  const data = await res.json();
  return data.possible_next_nonce ?? data.nonce ?? 0;
}

async function waitForTx(txid) {
  process.stdout.write(`    waiting`);
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    const res = await fetch(`${BASE_URL}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const d = await res.json();
      if (d.tx_status === "success") { console.log(" confirmed ✓"); return; }
      if (d.tx_status?.startsWith("abort")) throw new Error(`aborted: ${d.tx_result?.repr}`);
    }
    process.stdout.write(".");
  }
  throw new Error(`${txid} did not confirm in time`);
}

async function broadcastHex(hexString) {
  const res = await fetch(`${BASE_URL}/v2/transactions`, {
    method:  "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body:    Buffer.from(hexString, "hex"),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`broadcast failed (${res.status}): ${text}`);
  return JSON.parse(text); // txid string
}

async function main() {
  console.log("\n-- Deploying v5 adapters to testnet --\n");

  let nonce = await getNonce();
  console.log(`Starting nonce: ${nonce}\n`);

  const txids = [];

  for (const { name, path } of CONTRACTS) {
    const codeBody = readFileSync(new URL(path, import.meta.url), "utf8");
    process.stdout.write(`  Deploying ${name}... `);

    const tx = await makeContractDeploy({
      contractName:      name,
      codeBody,
      senderKey:         PRIVATE_KEY,
      network,
      nonce:             BigInt(nonce++),
      clarityVersion:    3,
      anchorMode:        AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee:               250_000n,
    });

    // serializeTransaction returns a hex string in @stacks/transactions v7.x
    const txid = await broadcastHex(serializeTransaction(tx));
    console.log(`txid ${txid}`);
    txids.push({ name, txid });
  }

  console.log("\nWaiting for all 4 contracts to confirm...\n");
  for (const { name, txid } of txids) {
    process.stdout.write(`  ${name}: `);
    await waitForTx(txid);
    console.log(`    https://explorer.hiro.so/txid/${txid}?chain=testnet`);
  }

  console.log("\n✓ All v5 adapters deployed. Now run init-v6.mjs.\n");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
