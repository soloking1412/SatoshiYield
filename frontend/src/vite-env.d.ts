/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: "testnet" | "mainnet";
  readonly VITE_DEPLOYER_TESTNET?: string;
  readonly VITE_DEPLOYER_MAINNET?: string;
  readonly VITE_VAULT_CONTRACT_NAME?: string;
  readonly VITE_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
