#!/usr/bin/env node
/**
 * End-to-end test: vault-v3 + v2 adapters on testnet
 * Tests: mint → deposit → rebalance → withdraw
 */

import {
  makeContractCall,
  contractPrincipalCV,
  standardPrincipalCV,
  uintCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

const DEPLOYER    = "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const PRIVATE_KEY = "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const NETWORK     = STACKS_TESTNET;
const BASE_URL    = NETWORK.client.baseUrl;
const VAULT       = "vault-v3";
const DEPOSIT_SATS = 100_000; // 0.001 sBTC, above MIN-DEPOSIT of 1_000

async function getNonce(addr) {
  const r = await fetch(`${BASE_URL}/v2/accounts/${addr}?proof=0`);
  return (await r.json()).nonce;
}

async function waitForTx(txid, label) {
  process.stdout.write(`  [${label}]`);
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    process.stdout.write(".");
    const r = await fetch(`${BASE_URL}/extended/v1/tx/${txid}`);
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

async function broadcast(opts, label, nonce) {
  process.stdout.write(`  tx ${label}... `);
  const tx = await makeContractCall({
    ...opts,
    senderKey: PRIVATE_KEY,
    network: NETWORK,
    nonce: BigInt(nonce),
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 5000,
  });
  const res = await broadcastTransaction({ transaction: tx, network: NETWORK });
  if (res.error) throw new Error(`${label}: ${res.error} ${res.reason ?? ""}`);
  console.log(`txid ${res.txid}`);
  return res.txid;
}

async function readUint(contract, fn) {
  const url = `${BASE_URL}/v2/contracts/call-read/${DEPLOYER}/${contract}/${fn}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: DEPLOYER, arguments: [] }),
  });
  const d = await r.json();
  if (!d.okay) return 0;
  // result is "(ok 0x...)" or just "0x..." — strip ok prefix (0701) + uint prefix (01)
  const hex = d.result.startsWith("0x") ? d.result.slice(2) : d.result;
  // Clarity uint result: 0701 <16-byte big-endian>
  if (hex.startsWith("0701")) return parseInt(hex.slice(4), 16);
  return parseInt(hex, 16);
}

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.log(`  ✗ ${msg}`); }

async function main() {
  console.log("\n── vault-v3 end-to-end test ─────────────────────────────────────");
  let nonce = await getNonce(DEPLOYER);
  console.log(`nonce: ${nonce}\n`);

  // ── Step 1: mint mock-sbtc to deployer ────────────────────────────────────
  console.log("1. Mint", DEPOSIT_SATS * 3, "mock-sbtc sats to deployer");
  const mintTx = await broadcast({
    contractAddress: DEPLOYER,
    contractName: "mock-sbtc",
    functionName: "mint",
    functionArgs: [uintCV(DEPOSIT_SATS * 3), standardPrincipalCV(DEPLOYER)],
  }, "mock-sbtc.mint", nonce++);
  await waitForTx(mintTx, "mint");

  // ── Step 2: deposit into bitflow-adapter-v2 ───────────────────────────────
  console.log("\n2. Deposit", DEPOSIT_SATS, "sats → vault-v3 (bitflow-adapter-v2)");
  const depositTx = await broadcast({
    contractAddress: DEPLOYER,
    contractName: VAULT,
    functionName: "deposit",
    functionArgs: [
      contractPrincipalCV(DEPLOYER, "bitflow-adapter-v2"),
      uintCV(DEPOSIT_SATS),
    ],
  }, "vault-v3.deposit", nonce++);
  await waitForTx(depositTx, "deposit");

  const bitflowDeposited = await readUint("bitflow-adapter-v2", "get-total-deposited");
  const vaultTotal       = await readUint(VAULT, "get-total-deposited");
  console.log(`  bitflow-adapter-v2.get-total-deposited = ${bitflowDeposited}`);
  console.log(`  vault-v3.get-total-deposited           = ${vaultTotal}`);
  if (bitflowDeposited > 0) pass("sBTC landed in adapter"); else fail("adapter shows 0 — deposit may have failed");
  if (vaultTotal === DEPOSIT_SATS) pass("vault TVL tracking correct"); else fail(`vault TVL mismatch (got ${vaultTotal})`);

  // ── Step 3: rebalance bitflow → zest ──────────────────────────────────────
  console.log("\n3. Rebalance bitflow-adapter-v2 → zest-adapter-v2");
  const rebalanceTx = await broadcast({
    contractAddress: DEPLOYER,
    contractName: VAULT,
    functionName: "rebalance",
    functionArgs: [
      contractPrincipalCV(DEPLOYER, "bitflow-adapter-v2"),
      contractPrincipalCV(DEPLOYER, "zest-adapter-v2"),
    ],
  }, "vault-v3.rebalance", nonce++);
  await waitForTx(rebalanceTx, "rebalance");

  const bitflowAfter = await readUint("bitflow-adapter-v2", "get-total-deposited");
  const zestAfter    = await readUint("zest-adapter-v2",    "get-total-deposited");
  console.log(`  bitflow-adapter-v2.get-total-deposited = ${bitflowAfter} (want 0)`);
  console.log(`  zest-adapter-v2.get-total-deposited    = ${zestAfter}  (want ${DEPOSIT_SATS})`);
  if (bitflowAfter === 0) pass("bitflow drained"); else fail("bitflow still has shares");
  if (zestAfter === DEPOSIT_SATS) pass("zest received position"); else fail(`zest mismatch (got ${zestAfter})`);

  // ── Step 4: withdraw from zest ────────────────────────────────────────────
  console.log("\n4. Withdraw from zest-adapter-v2");
  const withdrawTx = await broadcast({
    contractAddress: DEPLOYER,
    contractName: VAULT,
    functionName: "withdraw",
    functionArgs: [contractPrincipalCV(DEPLOYER, "zest-adapter-v2")],
  }, "vault-v3.withdraw", nonce++);
  await waitForTx(withdrawTx, "withdraw");

  const zestFinal   = await readUint("zest-adapter-v2", "get-total-deposited");
  const vaultFinal  = await readUint(VAULT, "get-total-deposited");
  console.log(`  zest-adapter-v2.get-total-deposited = ${zestFinal}  (want 0)`);
  console.log(`  vault-v3.get-total-deposited        = ${vaultFinal} (want 0)`);
  if (zestFinal === 0) pass("zest cleared"); else fail("zest still has shares");
  if (vaultFinal === 0) pass("vault TVL back to 0"); else fail(`vault TVL mismatch (got ${vaultFinal})`);

  console.log("\n── Test complete ─────────────────────────────────────────────────");
  console.log("Explorer:", `https://explorer.hiro.so/address/${DEPLOYER}?chain=testnet`);
}

main().catch(err => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
