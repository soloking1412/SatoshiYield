// Mainnet-only build. The Mainnet-beta branch ships exclusively against
// Stacks mainnet (sBTC at SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token).
// VITE_NETWORK is still validated in lib/stacksClient.ts so an accidental
// "testnet" build fails fast.

const network = import.meta.env.VITE_NETWORK;
if (network !== "mainnet") {
  throw new Error(
    `Mainnet-beta branch requires VITE_NETWORK="mainnet" (got ${JSON.stringify(network)}).`
  );
}

const DEPLOYER_RAW = import.meta.env.VITE_DEPLOYER_MAINNET;
if (!DEPLOYER_RAW || DEPLOYER_RAW === "REPLACE_WITH_MAINNET_DEPLOYER") {
  throw new Error(
    "VITE_DEPLOYER_MAINNET must be set to the mainnet deployer (Asigna multi-sig) address."
  );
}

export const DEPLOYER: string = DEPLOYER_RAW;

// vault-v5 — SIP-010 token trait + rebalance staleness guard
const VAULT_NAME = "vault-v5";

export const CONTRACTS = {
  VAULT: `${DEPLOYER}.${VAULT_NAME}`,
  SBTC_TOKEN: "SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token",
  ADAPTERS: {
    bitflow: `${DEPLOYER}.bitflow-adapter-v4`,
    alex:    `${DEPLOYER}.alex-adapter-v4`,
    zest:    `${DEPLOYER}.zest-adapter-v4`,
    velar:   `${DEPLOYER}.velar-adapter-v4`,
  },
} as const;
