#!/usr/bin/env node
/**
 * Post-deployment initialization for vault-v2 (with TVL-cap & fee-precision fixes).
 *
 * Actions:
 *   1. vault-v2.approve-adapter(adapter) × 4
 *   2. adapter.set-vault(vault-v2) × 4  (re-point adapters to vault-v2)
 *
 * Does NOT re-initialize yield-tracker (already initialized against original vault).
 *
 * Usage:
 *   DEPLOYER=ST1xxx PRIVATE_KEY=0x... node scripts/init-vault-v2.js
 */

import {
  makeContractCall,
  contractPrincipalCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const DEPLOYER = process.env.DEPLOYER;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const NETWORK_ENV = process.env.NETWORK ?? "testnet";
const VAULT_NAME = "vault-v2";

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

async function waitForTx(txid) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${baseUrl}/extended/v1/tx/${txid}`);
    if (res.ok) {
      const data = await res.json();
      if (data.tx_status === "success") return true;
      if (data.tx_status?.startsWith("abort")) {
        throw new Error(`Tx ${txid} aborted: ${data.tx_status}`);
      }
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`Tx ${txid} did not confirm in time`);
}

async function broadcast(txOptions, description) {
  process.stdout.write(`  ${description}... `);
  const tx = await makeContractCall({ ...txOptions, senderKey: PRIVATE_KEY });
  const result = await broadcastTransaction({ transaction: tx, network });
  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} - ${result.reason}`);
  }
  console.log(`txid ${result.txid}`);
  return result.txid;
}

async function main() {
  console.log(`Initializing ${VAULT_NAME} on ${NETWORK_ENV}`);
  console.log(`Deployer: ${DEPLOYER}\n`);

  let nonce = await getNonce(DEPLOYER);
  const txids = [];

  // Step 1: approve all adapters in vault-v2
  console.log(`Step 1: Approve adapters in ${VAULT_NAME}`);
  for (const adapter of ADAPTERS) {
    txids.push(
      await broadcast(
        {
          contractAddress: DEPLOYER,
          contractName: VAULT_NAME,
          functionName: "approve-adapter",
          functionArgs: [contractPrincipalCV(DEPLOYER, adapter)],
          nonce: nonce++,
          network,
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          fee: 3000,
        },
        `${VAULT_NAME}.approve-adapter(${adapter})`
      )
    );
  }

  // Step 2: re-point each adapter to vault-v2
  console.log(`\nStep 2: Re-point adapters to ${VAULT_NAME}`);
  for (const adapter of ADAPTERS) {
    txids.push(
      await broadcast(
        {
          contractAddress: DEPLOYER,
          contractName: adapter,
          functionName: "set-vault",
          functionArgs: [contractPrincipalCV(DEPLOYER, VAULT_NAME)],
          nonce: nonce++,
          network,
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          fee: 3000,
        },
        `${adapter}.set-vault(${VAULT_NAME})`
      )
    );
  }

  console.log(`\nBroadcast ${txids.length} transactions. Waiting for confirmations...\n`);

  for (const txid of txids) {
    process.stdout.write(`  waiting ${txid.slice(0, 12)}... `);
    await waitForTx(txid);
    console.log("confirmed");
  }

  console.log(`\n✔ Done. All ${ADAPTERS.length} adapters approved + re-pointed to ${VAULT_NAME}.`);
  console.log(`\nExplorer: https://explorer.hiro.so/address/${DEPLOYER}.${VAULT_NAME}?chain=${NETWORK_ENV}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
