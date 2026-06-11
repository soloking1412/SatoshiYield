/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: "testnet" | "mainnet";
  readonly VITE_DEPLOYER_TESTNET?: string;
  readonly VITE_DEPLOYER_MAINNET?: string;
  readonly VITE_VAULT_CONTRACT_NAME?: string;
  readonly VITE_INDEXER_URL?: string;
  // Per-protocol adapter contract-name overrides. Default to the live adapters
  // (zest-earn-adapter / hermetica-hbtc-adapter). Keep in sync with the indexer.
  readonly VITE_ZEST_ADAPTER?: string;
  readonly VITE_HBTC_ADAPTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
