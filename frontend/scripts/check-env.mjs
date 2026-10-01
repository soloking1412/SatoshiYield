#!/usr/bin/env node
import { loadEnv } from "vite";
import { validateStacksAddress } from "@stacks/transactions";
const mode = process.argv[2] ?? "production";
const env = {...loadEnv(mode,process.cwd(),"VITE_"),...process.env};
const network = env.VITE_NETWORK;
if(!["mainnet","testnet"].includes(network)) throw new Error("VITE_NETWORK must be mainnet or testnet");
const address = network === "mainnet" ? env.VITE_DEPLOYER_MAINNET : env.VITE_DEPLOYER_TESTNET;
const prefixes = network === "mainnet" ? ["SP","SM"] : ["ST","SN"];
if(!address || !prefixes.some(p=>address.startsWith(p)) || !validateStacksAddress(address)) throw new Error(`Invalid ${network} deployer`);
const vault = env.VITE_VAULT_CONTRACT_NAME ?? "vault-v6";
if(!["vault-v6","vault-v7"].includes(vault)) throw new Error("Unsupported vault version");
if(network === "mainnet" && env.VITE_ENABLE_TESTNET_DEPOSITS === "true") throw new Error("Testnet deposit flag cannot be used in a mainnet build");
if(env.VITE_INDEXER_URL) {
  const url = new URL(env.VITE_INDEXER_URL);
  if(url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("Remote indexer must use HTTPS");
  if(url.username || url.password) throw new Error("Indexer URL cannot contain credentials");
}
console.log(`[check-env] Valid ${network} / ${vault}; mainnet deposits are disabled in this candidate.`);
