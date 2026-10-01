import { validateStacksAddress } from "@stacks/transactions";
import { networkName } from "../lib/stacksClient.js";
const isTestnet = networkName === "testnet";
const deployer = isTestnet ? import.meta.env.VITE_DEPLOYER_TESTNET : import.meta.env.VITE_DEPLOYER_MAINNET;
const prefixes = isTestnet ? ["ST", "SN"] : ["SP", "SM"];
if (!deployer || !prefixes.some((p) => deployer.startsWith(p)) || !validateStacksAddress(deployer)) {
  throw new Error(`Set a valid ${networkName} deployer address before starting SatoshiYields.`);
}
export const DEPLOYER: string = deployer;
const vaultName = import.meta.env.VITE_VAULT_CONTRACT_NAME ?? "vault-v6";
if (vaultName !== "vault-v6" && vaultName !== "vault-v7") throw new Error("Unsupported vault version");
export const VAULT_VERSION = vaultName === "vault-v7" ? "v7" : "v6";
function contractName(value: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value)) throw new Error("Invalid adapter contract name");
  return value;
}
const zestName = contractName(import.meta.env.VITE_ZEST_ADAPTER ?? (VAULT_VERSION === "v7" ? (isTestnet ? "mock-sync-v7" : "zest-earn-adapter-v7") : "zest-earn-adapter"));
const hbtcName = contractName(import.meta.env.VITE_HBTC_ADAPTER ?? (VAULT_VERSION === "v7" ? (isTestnet ? "mock-async-v7" : "hermetica-hbtc-adapter-v7") : "hermetica-hbtc-adapter"));
export const CONTRACTS = {
  VAULT: `${DEPLOYER}.${vaultName}`,
  SBTC_TOKEN: isTestnet ? `${DEPLOYER}.mock-sbtc` : "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  ADAPTERS: { zest: `${DEPLOYER}.${zestName}`, hbtc: `${DEPLOYER}.${hbtcName}` },
} as const;
export const SBTC_ASSET_NAME = isTestnet ? "mock-sbtc" : "sbtc-token";
// A mainnet environment toggle cannot approve unreviewed integrations.
export const DEPOSITS_ENABLED = isTestnet && VAULT_VERSION === "v7" && import.meta.env.VITE_ENABLE_TESTNET_DEPOSITS === "true";
export const DEPOSIT_BLOCK_REASON = networkName === "mainnet"
  ? "New deposits are disabled in this rebuild pending independent review and verified integrations. Existing positions retain withdrawal access."
  : VAULT_VERSION === "v6" ? "Select a deployed vault-v7 testnet configuration to exercise the rebuild."
  : "Testnet deposits require an explicitly configured and initialized deployment.";
