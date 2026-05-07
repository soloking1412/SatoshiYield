#!/usr/bin/env node
/**
 * M2 post-deployment initialisation.
 *
 * Actions (in order, one nonce each):
 *   1. vault-v2.approve-adapter(adapter)   × 4
 *   2. adapter.set-vault(vault-v2)         × 4
 *   3. adapter.set-oracle(oracle)          × 4   ← registers oracle wallet on slot 0
 *
 * Usage:
 *   DEPLOYER=ST1xxx PRIVATE_KEY=<hex64> node scripts/init-m2.js
 *
 * Or use the known testnet deployer key directly (no env vars needed):
 *   node scripts/init-m2.js
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

// ── config ──────────────────────────────────────────────────────────────────
const DEPLOYER   = process.env.DEPLOYER    ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const ORACLE_ADDR = process.env.ORACLE_ADDR ?? DEPLOYER;   // oracle wallet = deployer for testnet
const NETWORK_ENV = process.env.NETWORK    ?? "testnet";
const VAULT_NAME  = "vault-v3";

const network  = NETWORK_ENV === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const baseUrl  = network.client.baseUrl;

const ADAPTERS = ["bitflow-adapter-v2", "alex-adapter-v2", "zest-adapter-v2", "velar-adapter-v2"];

// ── helpers ──────────────────────────────────────────────────────────────────
async function getNonce(address) {
  const res  = await fetch(`${baseUrl}/v2/accounts/${address}?proof=0`);
  const data = await res.json();
  return data.nonce;
}

async function waitForTx(txid) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    const res = await fetch(`${baseUrl}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const d = await res.json();
      if (d.tx_status === "success")           return true;
      if (d.tx_status?.startsWith("abort"))    throw new Error(`Tx ${txid} aborted: ${d.tx_status}`);
    }
  }
  throw new Error(`Tx ${txid} did not confirm within 5 min`);
}

async function broadcast(opts, label) {
  process.stdout.write(`  ${label}... `);
  const tx = await makeContractCall({
    ...opts,
    senderKey: PRIVATE_KEY,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 3000,
  });
  const result = await broadcastTransaction({ transaction: tx, network });
  if (result.error) throw new Error(`${label} failed: ${result.error} — ${result.reason ?? ""}`);
  console.log(`txid ${result.txid}`);
  return result.txid;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n── SatoshiYields M2 init (${NETWORK_ENV}) ──────────────────────`);
  console.log(`Deployer : ${DEPLOYER}`);
  console.log(`Oracle   : ${ORACLE_ADDR}`);
  console.log(`Vault    : ${VAULT_NAME}\n`);

  let nonce = await getNonce(DEPLOYER);
  const txids = [];

  // ── Step 1: approve all adapters in vault-v2 ────────────────────────────
  console.log("Step 1 — approve-adapter in vault-v2");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:   VAULT_NAME,
      functionName:   "approve-adapter",
      functionArgs:   [contractPrincipalCV(DEPLOYER, adapter)],
      nonce: nonce++,
    }, `${VAULT_NAME}.approve-adapter(${adapter})`));
  }

  // ── Step 2: point each adapter back to vault-v2 ─────────────────────────
  console.log("\nStep 2 — set-vault on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:   adapter,
      functionName:   "set-vault",
      functionArgs:   [contractPrincipalCV(DEPLOYER, VAULT_NAME)],
      nonce: nonce++,
    }, `${adapter}.set-vault(${VAULT_NAME})`));
  }

  // ── Step 3: register oracle wallet on slot 0 of each adapter ────────────
  console.log("\nStep 3 — set-oracle on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:   adapter,
      functionName:   "set-oracle",
      functionArgs:   [standardPrincipalCV(ORACLE_ADDR)],
      nonce: nonce++,
    }, `${adapter}.set-oracle(${ORACLE_ADDR})`));
  }

  // ── wait for all txs ─────────────────────────────────────────────────────
  console.log(`\nBroadcast ${txids.length} transactions — waiting for confirmations (~30 s each)...\n`);
  for (const txid of txids) {
    process.stdout.write(`  ${txid.slice(0, 14)}... `);
    await waitForTx(txid);
    console.log("confirmed ✓");
  }

  console.log(`\n✔  M2 init complete.`);
  console.log(`   ${ADAPTERS.length} adapters approved, pointed to ${VAULT_NAME}, oracle registered.`);
  console.log(`\nExplorer: https://explorer.hiro.so/address/${DEPLOYER}?chain=${NETWORK_ENV}\n`);
}

main().catch(err => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
