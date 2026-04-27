/**
 * Mint mock-sBTC to a testnet address.
 * Usage:
 *   /opt/homebrew/bin/node scripts/mint-sbtc.mjs <recipient> <amount_sats>
 *
 * Example (mint 1 sBTC = 100000000 sats to deployer):
 *   /opt/homebrew/bin/node scripts/mint-sbtc.mjs ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1 100000000
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { makeContractCall, uintCV, standardPrincipalCV, broadcastTransaction, AnchorMode, PostConditionMode } =
  require("/Users/soloking/SatoshiYield/scripts/node_modules/@stacks/transactions");
const { STACKS_TESTNET } = require("/Users/soloking/SatoshiYield/scripts/node_modules/@stacks/network");

const DEPLOYER = "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const PRIVATE_KEY = "0xcf70b45e9f19063616faca847a1616d5ea53145ab96a5ff680a9004f402834a401";

const recipient = process.argv[2] ?? DEPLOYER;
const amountSats = parseInt(process.argv[3] ?? "100000000"); // default 1 sBTC

async function getNonce(address) {
  const res = await fetch(`https://api.testnet.hiro.so/v2/accounts/${address}?proof=0`);
  const data = await res.json();
  return data.nonce;
}

async function main() {
  console.log(`Minting ${amountSats} sats (${amountSats / 1e8} sBTC) to ${recipient}...`);

  const nonce = await getNonce(DEPLOYER);

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName: "mock-sbtc",
    functionName: "mint",
    functionArgs: [uintCV(amountSats), standardPrincipalCV(recipient)],
    senderKey: PRIVATE_KEY,
    nonce,
    network: STACKS_TESTNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 2000,
  });

  const result = await broadcastTransaction({ transaction: tx, network: STACKS_TESTNET });

  if (result.error) {
    console.error("Failed:", result.error, result.reason);
    process.exit(1);
  }

  console.log("✓ Broadcast txid:", result.txid);
  console.log(`  Track at: https://explorer.hiro.so/txid/${result.txid}?chain=testnet`);
  console.log("\nWait ~2 minutes for confirmation, then refresh the app.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
