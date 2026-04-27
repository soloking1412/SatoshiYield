#!/usr/bin/env node
/**
 * Post-deployment initialization script for SatoshiYield testnet.
 *
 * Run AFTER clarinet deployments apply completes successfully.
 *
 * Usage:
 *   DEPLOYER=ST1xxx... PRIVATE_KEY=0x... node scripts/init-testnet.js
 *
 * Environment variables:
 *   DEPLOYER      - Your testnet STX address (e.g. ST1PQHQKV0...)
 *   PRIVATE_KEY   - Deployer private key (hex, with 01 suffix for compressed)
 *   NETWORK       - "testnet" (default) or "mainnet"
 */

import {
  makeContractCall,
  contractPrincipalCV,
  standardPrincipalCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const DEPLOYER = process.env.DEPLOYER;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const NETWORK_ENV = process.env.NETWORK ?? "testnet";

if (!DEPLOYER || !PRIVATE_KEY) {
  console.error("Error: DEPLOYER and PRIVATE_KEY env vars are required.");
  process.exit(1);
}

const network = NETWORK_ENV === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const baseUrl = network.client.baseUrl;

const ADAPTERS = ["bitflow-adapter", "alex-adapter", "zest-adapter", "velar-adapter"];

async function getNonce(address) {
  const res = await fetch(`${baseUrl}/v2/accounts/${address}?proof=0`);
  const data = await res.json();
  return data.nonce;
}

async function broadcast(txOptions) {
  const tx = await makeContractCall({ ...txOptions, senderKey: PRIVATE_KEY });
  const result = await broadcastTransaction({ transaction: tx, network });
  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} - ${result.reason}`);
  }
  console.log(`  txid: ${result.txid}`);
  return result.txid;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Initializing SatoshiYield on ${NETWORK_ENV}...`);
  console.log(`Deployer: ${DEPLOYER}\n`);

  let nonce = await getNonce(DEPLOYER);

  // Step 1: approve all adapters in the vault
  console.log("Step 1: Approve adapters in vault");
  for (const adapter of ADAPTERS) {
    process.stdout.write(`  approve-adapter ${adapter}... `);
    await broadcast({
      contractAddress: DEPLOYER,
      contractName: "vault",
      functionName: "approve-adapter",
      functionArgs: [contractPrincipalCV(DEPLOYER, adapter)],
      nonce: nonce++,
      network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 2000,
    });
  }

  // Step 2: set-vault on each adapter
  console.log("\nStep 2: set-vault on each adapter");
  for (const adapter of ADAPTERS) {
    process.stdout.write(`  set-vault on ${adapter}... `);
    await broadcast({
      contractAddress: DEPLOYER,
      contractName: adapter,
      functionName: "set-vault",
      functionArgs: [contractPrincipalCV(DEPLOYER, "vault")],
      nonce: nonce++,
      network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 2000,
    });
  }

  // Step 3: initialize yield-tracker
  console.log("\nStep 3: Initialize yield-tracker");
  process.stdout.write("  initialize... ");
  await broadcast({
    contractAddress: DEPLOYER,
    contractName: "yield-tracker",
    functionName: "initialize",
    functionArgs: [contractPrincipalCV(DEPLOYER, "vault")],
    nonce: nonce++,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 2000,
  });

  console.log("\nDone. Update frontend/src/constants/contracts.ts:");
  console.log(`  DEPLOYER_TESTNET = "${DEPLOYER}"`);
  console.log("\nNext: start the indexer and frontend:");
  console.log("  cd indexer && npm start");
  console.log("  cd frontend && npm run dev");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
