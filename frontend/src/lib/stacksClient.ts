import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";

// Supports both "mainnet" (production) and "testnet" (Phase 2 smoke-test).
// Set VITE_NETWORK in .env.local (mainnet) or .env.testnet.local (testnet).
const rawNetwork = import.meta.env.VITE_NETWORK;
if (rawNetwork !== "mainnet" && rawNetwork !== "testnet") {
  throw new Error(
    `VITE_NETWORK must be "mainnet" or "testnet" (got ${JSON.stringify(rawNetwork)}).`
  );
}

export const networkName = rawNetwork as "mainnet" | "testnet";
export const stacksNetwork =
  rawNetwork === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
