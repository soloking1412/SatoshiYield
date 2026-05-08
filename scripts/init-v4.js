#!/usr/bin/env node
import {
  makeContractCall,
  contractPrincipalCV,
  standardPrincipalCV,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const DEPLOYER    = process.env.DEPLOYER    ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const ORACLE_ADDR = process.env.ORACLE_ADDR ?? DEPLOYER;
const NETWORK_ENV = process.env.NETWORK     ?? "testnet";
const VAULT_NAME  = "vault-v4";

const network = NETWORK_ENV === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const baseUrl = network.client.baseUrl;

const ADAPTERS = [
  "bitflow-adapter-v3",
  "alex-adapter-v3",
  "zest-adapter-v3",
  "velar-adapter-v3",
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
  if (result.error) throw new Error(`${label} failed: ${result.error} — ${result.reason ?? ""}`);
  console.log(`txid ${result.txid}`);
  return result.txid;
}

async function main() {
  console.log(`\n── SatoshiYields v4 init (${NETWORK_ENV}) ──`);
  console.log(`Deployer : ${DEPLOYER}`);
  console.log(`Oracle   : ${ORACLE_ADDR}`);
  console.log(`Vault    : ${VAULT_NAME}\n`);

  let nonce = await getNonce(DEPLOYER);
  const txids = [];

  console.log("Step 1 — approve-adapter in vault-v4");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    VAULT_NAME,
      functionName:    "approve-adapter",
      functionArgs:    [contractPrincipalCV(DEPLOYER, adapter)],
      nonce:           nonce++,
    }, `${VAULT_NAME}.approve-adapter(${adapter})`));
  }

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

  console.log("\nStep 3 — set-oracle on each adapter");
  for (const adapter of ADAPTERS) {
    txids.push(await broadcast({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "set-oracle",
      functionArgs:    [standardPrincipalCV(ORACLE_ADDR)],
      nonce:           nonce++,
    }, `${adapter}.set-oracle(${ORACLE_ADDR})`));
  }

  console.log(`\nWaiting for ${txids.length} confirmations...\n`);
  for (const txid of txids) {
    process.stdout.write(`  ${txid.slice(0, 14)}... `);
    await waitForTx(txid);
    console.log("confirmed");
  }

  console.log(`\nv4 init complete.`);
  console.log(`${ADAPTERS.length} adapters approved, pointed to ${VAULT_NAME}, oracle registered.`);
  console.log(`Explorer: https://explorer.hiro.so/address/${DEPLOYER}?chain=${NETWORK_ENV}\n`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
