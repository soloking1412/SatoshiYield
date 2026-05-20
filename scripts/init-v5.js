#!/usr/bin/env node
/**
 * v5 post-deployment initialisation.
 *
 *   0. vault-v5.set-sbtc-token(mock-sbtc)        x 1
 *   1. vault-v5.approve-adapter(adapter)        x 4
 *   2. adapter-v4.set-vault(vault-v5)           x 4
 *   3. adapter-v4.set-oracle(ORACLE_ADDR)       x 4   (oracle slot 0)
 *   4. adapter-v4.set-oracle-at(1, ORACLE2_ADDR) x 4  (slot 1 - only if set)
 *
 * Run AFTER deploying the v5 bundle under the fresh deployer wallet:
 *   DEPLOYER=<fresh-addr> PRIVATE_KEY=<fresh-hex64> \
 *   ORACLE_ADDR=<oracle1> ORACLE2_ADDR=<oracle2> node scripts/init-v5.js
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
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const DEPLOYER     = process.env.DEPLOYER;
const PRIVATE_KEY  = process.env.PRIVATE_KEY;
const ORACLE_ADDR  = process.env.ORACLE_ADDR ?? DEPLOYER;
const ORACLE2_ADDR = process.env.ORACLE2_ADDR ?? "";
const NETWORK_ENV  = process.env.NETWORK ?? "testnet";
const VAULT_NAME   = "vault-v5";

if (!DEPLOYER || !PRIVATE_KEY) {
  console.error("Set DEPLOYER and PRIVATE_KEY env vars (the fresh deployer wallet).");
  process.exit(1);
}

const network = NETWORK_ENV === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const baseUrl = network.client.baseUrl;

const ADAPTERS = [
  "bitflow-adapter-v4",
  "alex-adapter-v4",
  "zest-adapter-v4",
  "velar-adapter-v4",
];

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
      if (d.tx_status === "success")        return true;
      if (d.tx_status?.startsWith("abort")) throw new Error(`${txid} aborted: ${d.tx_status}`);
    }
  }
  throw new Error(`${txid} did not confirm within 5 min`);
}

async function broadcast(opts, label) {
  process.stdout.write(`  ${label}... `);
  const tx = await makeContractCall({
    ...opts,
    senderKey:         PRIVATE_KEY,
    network,
    anchorMode:        AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee:               3000,
  });
  const result = await broadcastTransaction({ transaction: tx, network });
  if (result.error) throw new Error(`${label} failed: ${result.error} - ${result.reason ?? ""}`);
  console.log(`txid ${result.txid}`);
  return result.txid;
}

async function main() {
  console.log(`\n-- SatoshiYields v5 init (${NETWORK_ENV}) --`);
  console.log(`Deployer  : ${DEPLOYER}`);
  console.log(`Oracle[0] : ${ORACLE_ADDR}`);
  console.log(`Oracle[1] : ${ORACLE2_ADDR || "(not set - single-oracle, no consensus)"}`);
  console.log(`Vault     : ${VAULT_NAME}\n`);

  let nonce = await getNonce(DEPLOYER);
  const txids = [];

  console.log("Step 0 - register the sBTC token on vault-v5");
  txids.push(await broadcast({
    contractAddress: DEPLOYER,
    contractName:    VAULT_NAME,
    functionName:    "set-sbtc-token",
    functionArgs:    [contractPrincipalCV(DEPLOYER, "mock-sbtc")],
    nonce:           nonce++,
  }, `${VAULT_NAME}.set-sbtc-token(mock-sbtc)`));

  console.log("\nStep 1 - approve-adapter in vault-v5");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    VAULT_NAME,
      functionName:    "approve-adapter",
      functionArgs:    [contractPrincipalCV(DEPLOYER, adapter)],
      nonce:           nonce++,
    }, `${VAULT_NAME}.approve-adapter(${adapter})`));
  }

  console.log("\nStep 2 - set-vault on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "set-vault",
      functionArgs:    [contractPrincipalCV(DEPLOYER, VAULT_NAME)],
      nonce:           nonce++,
    }, `${adapter}.set-vault(${VAULT_NAME})`));
  }

  console.log("\nStep 3 - set-oracle-at(0, ...) on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "set-oracle-at",
      functionArgs:    [uintCV(0), standardPrincipalCV(ORACLE_ADDR)],
      nonce:           nonce++,
    }, `${adapter}.set-oracle-at(0, ${ORACLE_ADDR})`));
  }

  if (ORACLE2_ADDR) {
    console.log("\nStep 4 - set-oracle-at(1, ...) on each adapter");
    for (const adapter of ADAPTERS) {
      txids.push(await broadcast({
        contractAddress: DEPLOYER,
        contractName:    adapter,
        functionName:    "set-oracle-at",
        functionArgs:    [uintCV(1), standardPrincipalCV(ORACLE2_ADDR)],
        nonce:           nonce++,
      }, `${adapter}.set-oracle-at(1, ${ORACLE2_ADDR})`));
    }
  }

  console.log(`\nWaiting for ${txids.length} confirmations...\n`);
  for (const txid of txids) {
    process.stdout.write(`  ${txid.slice(0, 14)}... `);
    await waitForTx(txid);
    console.log("confirmed");
  }

  console.log(`\nv5 init complete.`);
  console.log(`${ADAPTERS.length} adapters approved, pointed to ${VAULT_NAME}, oracles registered.`);
  console.log(`Explorer: https://explorer.hiro.so/address/${DEPLOYER}?chain=${NETWORK_ENV}\n`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
