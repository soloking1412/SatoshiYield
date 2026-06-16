// Supports "mainnet" (production Asigna deployer, real sBTC) and
// "testnet" (smoke-test, testnet deployer, mock-sbtc).
// VITE_NETWORK is validated in lib/stacksClient.ts; this file mirrors it so
// the contract addresses are always derived from the correct deployer.

const network = import.meta.env.VITE_NETWORK;
if (network !== "mainnet" && network !== "testnet") {
  throw new Error(
    `VITE_NETWORK must be "mainnet" or "testnet" (got ${JSON.stringify(network)}).`
  );
}

const isTestnet = network === "testnet";

// Deployer: Asigna 2-of-3 multi-sig on mainnet; testnet dev wallet otherwise.
const DEPLOYER_RAW = isTestnet
  ? import.meta.env.VITE_DEPLOYER_TESTNET
  : import.meta.env.VITE_DEPLOYER_MAINNET;

if (!DEPLOYER_RAW || DEPLOYER_RAW === "REPLACE_WITH_MAINNET_DEPLOYER") {
  throw new Error(
    isTestnet
      ? "VITE_DEPLOYER_TESTNET must be set to the testnet deployer address (ST...)."
      : "VITE_DEPLOYER_MAINNET must be set to the mainnet deployer (Asigna multi-sig) address."
  );
}

export const DEPLOYER: string = DEPLOYER_RAW;

const VAULT_NAME = "vault-v6";

const SBTC_TOKEN = isTestnet
  ? `${DEPLOYER_RAW}.mock-sbtc`
  : "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

// Adapter contract names — env-overridable so a rename needs no code change.
// Add one entry here when enabling a new adapter. Keep in sync with indexer ADAPTER_REGISTRY.
const ADAPTER_NAMES = {
  zest: import.meta.env.VITE_ZEST_ADAPTER ?? "zest-earn-adapter",
  // hbtc: import.meta.env.VITE_HBTC_ADAPTER ?? "hermetica-hbtc-adapter",
};

export const CONTRACTS = {
  VAULT: `${DEPLOYER}.${VAULT_NAME}`,
  SBTC_TOKEN,
  ADAPTERS: {
    zest: `${DEPLOYER}.${ADAPTER_NAMES.zest}`,
    // hbtc: `${DEPLOYER}.${ADAPTER_NAMES.hbtc}`,
  },
} as const;
