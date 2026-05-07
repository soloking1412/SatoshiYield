/**
 * All contract addresses are driven by environment variables so the same
 * build can target different networks/deployers without code changes.
 *
 * Env vars (defaults are testnet):
 *   VITE_NETWORK              - "testnet" (default) or "mainnet"
 *   VITE_DEPLOYER_TESTNET     - Testnet deployer STX address
 *   VITE_DEPLOYER_MAINNET     - Mainnet deployer STX address
 *   VITE_VAULT_CONTRACT_NAME  - Vault contract name (default "vault-v3")
 */

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

const DEPLOYER_TESTNET =
  import.meta.env.VITE_DEPLOYER_TESTNET ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const DEPLOYER_MAINNET =
  import.meta.env.VITE_DEPLOYER_MAINNET ?? "REPLACE_WITH_MAINNET_DEPLOYER";

export const DEPLOYER = isMainnet ? DEPLOYER_MAINNET : DEPLOYER_TESTNET;

const VAULT_NAME = import.meta.env.VITE_VAULT_CONTRACT_NAME ?? "vault-v3";

export const CONTRACTS = {
  VAULT: `${DEPLOYER}.${VAULT_NAME}`,
  REBALANCER: `${DEPLOYER}.rebalancer`,
  SBTC_TOKEN: isMainnet
    ? "SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token"
    : `${DEPLOYER}.mock-sbtc`,
  ADAPTERS: {
    bitflow: `${DEPLOYER}.bitflow-adapter-v2`,
    alex: `${DEPLOYER}.alex-adapter-v2`,
    zest: `${DEPLOYER}.zest-adapter-v2`,
    velar: `${DEPLOYER}.velar-adapter-v2`,
  },
} as const;
