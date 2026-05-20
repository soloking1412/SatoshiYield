const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

const DEPLOYER_TESTNET =
  import.meta.env.VITE_DEPLOYER_TESTNET ?? "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const DEPLOYER_MAINNET =
  import.meta.env.VITE_DEPLOYER_MAINNET ?? "REPLACE_WITH_MAINNET_DEPLOYER";

// Fail the build loudly rather than ship a mainnet bundle with a placeholder
// deployer — every contract call would otherwise target a non-existent address.
if (isMainnet && DEPLOYER_MAINNET === "REPLACE_WITH_MAINNET_DEPLOYER") {
  throw new Error(
    "VITE_DEPLOYER_MAINNET must be set for a mainnet build (placeholder still in use)."
  );
}

export const DEPLOYER = isMainnet ? DEPLOYER_MAINNET : DEPLOYER_TESTNET;

// vault-v5 — SIP-010 token trait + rebalance staleness guard
const VAULT_NAME = "vault-v5";

export const CONTRACTS = {
  VAULT: `${DEPLOYER}.${VAULT_NAME}`,
  REBALANCER: `${DEPLOYER}.rebalancer`,
  SBTC_TOKEN: isMainnet
    ? "SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token"
    : `${DEPLOYER}.mock-sbtc`,
  ADAPTERS: {
    bitflow: `${DEPLOYER}.bitflow-adapter-v4`,
    alex:    `${DEPLOYER}.alex-adapter-v4`,
    zest:    `${DEPLOYER}.zest-adapter-v4`,
    velar:   `${DEPLOYER}.velar-adapter-v4`,
  },
} as const;
