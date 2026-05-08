const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

const DEPLOYER_TESTNET =
  import.meta.env.VITE_DEPLOYER_TESTNET ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const DEPLOYER_MAINNET =
  import.meta.env.VITE_DEPLOYER_MAINNET ?? "REPLACE_WITH_MAINNET_DEPLOYER";

export const DEPLOYER = isMainnet ? DEPLOYER_MAINNET : DEPLOYER_TESTNET;

// vault-v4 is the current production vault — env var kept for emergency override only
const VAULT_NAME = "vault-v4";

export const CONTRACTS = {
  VAULT: `${DEPLOYER}.${VAULT_NAME}`,
  REBALANCER: `${DEPLOYER}.rebalancer`,
  SBTC_TOKEN: isMainnet
    ? "SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token"
    : `${DEPLOYER}.mock-sbtc`,
  ADAPTERS: {
    bitflow: `${DEPLOYER}.bitflow-adapter-v3`,
    alex:    `${DEPLOYER}.alex-adapter-v3`,
    zest:    `${DEPLOYER}.zest-adapter-v3`,
    velar:   `${DEPLOYER}.velar-adapter-v3`,
  },
} as const;
