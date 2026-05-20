import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const rawNetwork = import.meta.env.VITE_NETWORK;

// Catch typos (e.g. "main", "Mainnet") instead of silently defaulting to testnet.
if (
  rawNetwork !== undefined &&
  rawNetwork !== "mainnet" &&
  rawNetwork !== "testnet"
) {
  throw new Error(
    `Invalid VITE_NETWORK "${rawNetwork}" — must be "mainnet" or "testnet".`
  );
}

const isMainnet = rawNetwork === "mainnet";

export const stacksNetwork = isMainnet ? STACKS_MAINNET : STACKS_TESTNET;

export const networkName: "mainnet" | "testnet" = isMainnet
  ? "mainnet"
  : "testnet";
