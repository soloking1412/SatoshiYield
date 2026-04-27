import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

export const stacksNetwork = isMainnet ? STACKS_MAINNET : STACKS_TESTNET;

export const networkName: "mainnet" | "testnet" = isMainnet
  ? "mainnet"
  : "testnet";
