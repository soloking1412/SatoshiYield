#!/usr/bin/env node
/**
 * v6 post-deployment initialisation — yield-accrual adapters (v5).
 *
 * Steps:
 *   1. vault-v5.approve-adapter(adapter)       × 4
 *   2. adapter-v5.set-vault(vault-v5)          × 4
 *   3. adapter-v5.set-oracle-at(0, oracle0)    × 4
 *   4. adapter-v5.set-oracle-at(1, oracle1)    × 4  (if ORACLE2_ADDR set)
 *   5. adapter-v5.set-oracle-at(2, oracle2)    × 4  (if ORACLE3_ADDR set)
 *   6. mock-sbtc.mint(YIELD_RESERVE × 4, deployer)
 *   7. adapter-v5.add-yield-reserve(YIELD_RESERVE, mock-sbtc) × 4
 *
 * Run AFTER deploying v6.testnet-plan.yaml:
 *   DEPLOYER=ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1 \
 *   PRIVATE_KEY=<hex64> \
 *   ORACLE_ADDR=<oracle0-address> \
 *   ORACLE2_ADDR=<oracle1-address> \
 *   ORACLE3_ADDR=<oracle2-address> \
 *   node scripts/init-v6.mjs
 */

import {
  makeContractCall,
  contractPrincipalCV,
  standardPrincipalCV,
  uintCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  Pc,
  FungibleConditionCode,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const DEPLOYER     = process.env.DEPLOYER;
const PRIVATE_KEY  = process.env.PRIVATE_KEY;
const ORACLE_ADDR  = process.env.ORACLE_ADDR  ?? DEPLOYER;
const ORACLE2_ADDR = process.env.ORACLE2_ADDR ?? "";
const ORACLE3_ADDR = process.env.ORACLE3_ADDR ?? "";
const NETWORK_ENV  = process.env.NETWORK      ?? "testnet";
const VAULT_NAME   = "vault-v5";
const SBTC_NAME    = "mock-sbtc";

// 10 sBTC per adapter as yield reserve (8 decimals → 1_000_000_000 sats each)
const YIELD_RESERVE_PER_ADAPTER = 1_000_000_000;

if (!DEPLOYER || !PRIVATE_KEY) {
  console.error("Set DEPLOYER and PRIVATE_KEY env vars.");
  process.exit(1);
}

const network = NETWORK_ENV === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const baseUrl  = network.client.baseUrl;

const ADAPTERS = [
  "bitflow-adapter-v5",
  "alex-adapter-v5",
  "zest-adapter-v5",
  "velar-adapter-v5",
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
  console.log(`\n-- SatoshiYields v6 init (${NETWORK_ENV}) --`);
  console.log(`Deployer  : ${DEPLOYER}`);
  console.log(`Oracle[0] : ${ORACLE_ADDR}`);
  if (ORACLE2_ADDR) console.log(`Oracle[1] : ${ORACLE2_ADDR}`);
  if (ORACLE3_ADDR) console.log(`Oracle[2] : ${ORACLE3_ADDR}`);
  console.log(`Yield reserve per adapter: ${YIELD_RESERVE_PER_ADAPTER / 1e8} sBTC\n`);

  let nonce = await getNonce(DEPLOYER);
  const txids = [];

  // Step 1 — approve v5 adapters in vault-v5
  console.log("Step 1 — approve-adapter in vault-v5");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    VAULT_NAME,
      functionName:    "approve-adapter",
      functionArgs:    [contractPrincipalCV(DEPLOYER, adapter)],
      nonce:           nonce++,
    }, `${VAULT_NAME}.approve-adapter(${adapter})`));
  }

  // Step 2 — point each adapter at vault-v5
  console.log("\nStep 2 — set-vault on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "set-vault",
      functionArgs:    [contractPrincipalCV(DEPLOYER, VAULT_NAME)],
      nonce:           nonce++,
    }, `${adapter}.set-vault(${VAULT_NAME})`));
  }

  // Step 3 — oracle slot 0
  console.log("\nStep 3 — set-oracle-at(0) on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "set-oracle-at",
      functionArgs:    [uintCV(0), standardPrincipalCV(ORACLE_ADDR)],
      nonce:           nonce++,
    }, `${adapter}.set-oracle-at(0, ${ORACLE_ADDR})`));
  }

  // Step 4 — oracle slot 1 (optional)
  if (ORACLE2_ADDR) {
    console.log("\nStep 4 — set-oracle-at(1) on each adapter");
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

  // Step 5 — oracle slot 2 (optional)
  if (ORACLE3_ADDR) {
    console.log("\nStep 5 — set-oracle-at(2) on each adapter");
    for (const adapter of ADAPTERS) {
      txids.push(await broadcast({
        contractAddress: DEPLOYER,
        contractName:    adapter,
        functionName:    "set-oracle-at",
        functionArgs:    [uintCV(2), standardPrincipalCV(ORACLE3_ADDR)],
        nonce:           nonce++,
      }, `${adapter}.set-oracle-at(2, ${ORACLE3_ADDR})`));
    }
  }

  // Step 6 — mint yield reserve sBTC to deployer
  const totalReserve = YIELD_RESERVE_PER_ADAPTER * ADAPTERS.length;
  console.log(`\nStep 6 — mint ${totalReserve / 1e8} sBTC yield reserve to deployer`);
  txids.push(await broadcast({
    contractAddress: DEPLOYER,
    contractName:    SBTC_NAME,
    functionName:    "mint",
    functionArgs:    [uintCV(totalReserve), standardPrincipalCV(DEPLOYER)],
    nonce:           nonce++,
  }, `${SBTC_NAME}.mint(${totalReserve}, ${DEPLOYER})`));

  // Wait for the mint to confirm before funding reserves
  console.log("\nWaiting for mint to confirm before funding reserves...");
  await waitForTx(txids[txids.length - 1]);
  console.log("Mint confirmed.\n");

  // Step 7 — fund each adapter's yield reserve
  nonce = await getNonce(DEPLOYER); // refresh nonce after wait
  console.log("Step 7 — add-yield-reserve on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "add-yield-reserve",
      functionArgs:    [
        uintCV(YIELD_RESERVE_PER_ADAPTER),
        contractPrincipalCV(DEPLOYER, SBTC_NAME),
      ],
      nonce:           nonce++,
    }, `${adapter}.add-yield-reserve(${YIELD_RESERVE_PER_ADAPTER / 1e8} sBTC)`));
  }

  console.log(`\nWaiting for remaining ${txids.length} txs to confirm...\n`);
  for (const txid of txids.slice(0, -ADAPTERS.length)) {
    process.stdout.write(`  ${txid.slice(0, 14)}... `);
    await waitForTx(txid);
    console.log("confirmed");
  }

  console.log(`\nv6 init complete.`);
  console.log(`4 yield-accrual adapters live on vault-v5.`);
  console.log(`Each adapter funded with ${YIELD_RESERVE_PER_ADAPTER / 1e8} sBTC yield reserve.`);
  console.log(`\nNext: update frontend ADAPTERS to point to *-adapter-v5 and push oracle APY.`);
  console.log(`Explorer: https://explorer.hiro.so/address/${DEPLOYER}?chain=${NETWORK_ENV}\n`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
