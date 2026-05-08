#!/usr/bin/env node
import {
  makeContractCall,
  standardPrincipalCV,
  uintCV,
  broadcastTransaction,
} from "@stacks/transactions";

const DEPLOYER    = process.env.DEPLOYER    ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "cf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";
const ORACLE2     = process.env.ORACLE2_ADDR ?? "ST3ATZPXKPXK7Y6G25PKS8CWNTRB1ZBM0EGXCS76Q";
const NETWORK     = "testnet";

const ADAPTERS = [
  "bitflow-adapter-v3",
  "alex-adapter-v3",
  "zest-adapter-v3",
  "velar-adapter-v3",
];

async function getNonce() {
  const res  = await fetch(`https://api.testnet.hiro.so/v2/accounts/${DEPLOYER}?proof=0`);
  const data = await res.json();
  return data.nonce;
}

async function waitForTx(txid) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 12_000));
    const res  = await fetch(`https://api.testnet.hiro.so/extended/v1/tx/${txid}`);
    const data = await res.json();
    if (data.tx_status === "success") return true;
    if (data.tx_status?.startsWith("abort")) throw new Error(`${txid} aborted: ${data.tx_status}`);
  }
  throw new Error(`${txid} timed out`);
}

async function main() {
  console.log(`Registering ${ORACLE2} as oracle[1] on all v3 adapters...`);
  let nonce = await getNonce();

  for (const adapter of ADAPTERS) {
    process.stdout.write(`  ${adapter}.set-oracle-at(1, ${ORACLE2})... `);
    const tx = await makeContractCall({
      contractAddress: DEPLOYER,
      contractName:    adapter,
      functionName:    "set-oracle-at",
      functionArgs:    [uintCV(1), standardPrincipalCV(ORACLE2)],
      senderKey:       PRIVATE_KEY,
      network:         NETWORK,
      nonce:           BigInt(nonce++),
      fee:             3000,
    });
    const result = await broadcastTransaction({ transaction: tx, network: NETWORK });
    if (result.error) throw new Error(`${adapter} failed: ${result.error}`);
    console.log(`txid ${result.txid}`);
  }

  console.log("\nAll 4 set-oracle-at transactions broadcast. Done.");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
