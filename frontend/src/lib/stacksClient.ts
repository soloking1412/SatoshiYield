import { STACKS_MAINNET } from "@stacks/network";

// Mainnet-only build. constants/contracts.ts also validates this — the double
// check is intentional so a misconfigured env can never produce a testnet bundle.
const rawNetwork = import.meta.env.VITE_NETWORK;
if (rawNetwork !== "mainnet") {
  throw new Error(
    `Mainnet-beta branch requires VITE_NETWORK="mainnet" (got ${JSON.stringify(rawNetwork)}).`
  );
}

export const stacksNetwork = STACKS_MAINNET;
export const networkName = "mainnet" as const;
