#!/usr/bin/env node
/**
 * End-to-end testnet flow: deposit → rebalance → withdraw against vault-v2.
 * Uses the deployer's mock-sBTC balance. Prints every txid for proof.
 *
 * Usage:
 *   DEPLOYER=ST1xxx PRIVATE_KEY=0x... node scripts/e2e-testnet.js
 */

import {
  makeContractCall,
  contractPrincipalCV,
  uintCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  Pc,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

const DEPLOYER = process.env.DEPLOYER;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const VAULT_NAME = process.env.VAULT_NAME ?? "vault-v2";
const AMOUNT_SATS = BigInt(process.env.AMOUNT_SATS ?? "100000"); // 0.001 sBTC

if (!DEPLOYER || !PRIVATE_KEY) {
  console.error("DEPLOYER and PRIVATE_KEY env vars are required.");
  process.exit(1);
}

const network = STACKS_TESTNET;
const baseUrl = network.client.baseUrl;
const SBTC_TOKEN = `${DEPLOYER}.mock-sbtc`;
const SBTC_ASSET_NAME = "mock-sbtc";

async function getNonce(address) {
  const res = await fetch(`${baseUrl}/v2/accounts/${address}?proof=0`);
  const data = await res.json();
  return data.nonce;
}

async function waitForTx(txid, label) {
  process.stdout.write(`  waiting ${label} (${txid.slice(0, 12)}...) `);
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${baseUrl}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const data = await res.json();
      if (data.tx_status === "success") {
        console.log("✔ confirmed");
        return data;
      }
      if (data.tx_status?.startsWith("abort")) {
        throw new Error(`Tx aborted: ${data.tx_status} - ${JSON.stringify(data.tx_result)}`);
      }
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 8_000));
  }
  throw new Error(`Tx ${txid} did not confirm in time`);
}

async function broadcast(txOptions, label) {
  process.stdout.write(`→ ${label}... `);
  const tx = await makeContractCall({ ...txOptions, senderKey: PRIVATE_KEY });
  const result = await broadcastTransaction({ transaction: tx, network });
  if (result.error) {
    throw new Error(`${label} broadcast failed: ${result.error} - ${result.reason}`);
  }
  console.log(`broadcast ${result.txid}`);
  return result.txid;
}

async function main() {
  console.log(`\n=== SatoshiYield end-to-end testnet flow ===`);
  console.log(`Vault:    ${DEPLOYER}.${VAULT_NAME}`);
  console.log(`Deposit:  ${AMOUNT_SATS} sats (${Number(AMOUNT_SATS) / 1e8} sBTC)`);
  console.log(`Explorer: https://explorer.hiro.so/address/${DEPLOYER}?chain=testnet\n`);

  let nonce = await getNonce(DEPLOYER);

  // ---- 1. DEPOSIT ----
  console.log("--- Step 1: Deposit to bitflow-adapter ---");
  const depositTx = await broadcast(
    {
      contractAddress: DEPLOYER,
      contractName: VAULT_NAME,
      functionName: "deposit",
      functionArgs: [
        contractPrincipalCV(DEPLOYER, "bitflow-adapter"),
        uintCV(AMOUNT_SATS),
      ],
      nonce: nonce++,
      network,
      anchorMode: AnchorMode.Any,
      postConditions: [
        Pc.principal(DEPLOYER).willSendEq(AMOUNT_SATS).ft(SBTC_TOKEN, SBTC_ASSET_NAME),
      ],
      postConditionMode: PostConditionMode.Deny,
      fee: 5000,
    },
    "deposit"
  );
  await waitForTx(depositTx, "deposit");

  // ---- 2. REBALANCE ----
  console.log("\n--- Step 2: Rebalance bitflow → velar ---");
  const rebalanceTx = await broadcast(
    {
      contractAddress: DEPLOYER,
      contractName: VAULT_NAME,
      functionName: "rebalance",
      functionArgs: [
        contractPrincipalCV(DEPLOYER, "bitflow-adapter"),
        contractPrincipalCV(DEPLOYER, "velar-adapter"),
      ],
      nonce: nonce++,
      network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 5000,
    },
    "rebalance"
  );
  await waitForTx(rebalanceTx, "rebalance");

  // ---- 3. WITHDRAW ----
  console.log("\n--- Step 3: Withdraw from velar-adapter ---");
  const withdrawTx = await broadcast(
    {
      contractAddress: DEPLOYER,
      contractName: VAULT_NAME,
      functionName: "withdraw",
      functionArgs: [contractPrincipalCV(DEPLOYER, "velar-adapter")],
      nonce: nonce++,
      network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 5000,
    },
    "withdraw"
  );
  await waitForTx(withdrawTx, "withdraw");

  console.log("\n=== ✔ All 3 flows succeeded ===");
  console.log(`Deposit:   https://explorer.hiro.so/txid/${depositTx}?chain=testnet`);
  console.log(`Rebalance: https://explorer.hiro.so/txid/${rebalanceTx}?chain=testnet`);
  console.log(`Withdraw:  https://explorer.hiro.so/txid/${withdrawTx}?chain=testnet`);
}

main().catch((err) => {
  console.error("\n✗ Fatal:", err.message);
  process.exit(1);
});
