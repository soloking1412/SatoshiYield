import { validateStacksAddress } from "@stacks/transactions";

export function validateNetworkConfig(env: NodeJS.ProcessEnv): {
  name: "mainnet" | "testnet";
  api: string;
  deployer: string;
} {
  const name = env["STACKS_NETWORK"];
  const deployer = env["DEPLOYER_ADDRESS"] ?? "";
  const api = env["STACKS_API_URL"] ?? "";
  if (name !== "mainnet" && name !== "testnet") {
    throw new Error("STACKS_NETWORK must explicitly be mainnet or testnet");
  }
  const prefix = name === "mainnet" ? /^S[PM]/ : /^S[TN]/;
  if (!validateStacksAddress(deployer) || !prefix.test(deployer)) {
    throw new Error("DEPLOYER_ADDRESS must be a valid principal on STACKS_NETWORK");
  }
  const url = new URL(api);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(name === "testnet" && local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("STACKS_API_URL must be an HTTPS API URL (local HTTP is testnet only)");
  }
  if ((name === "mainnet" && url.hostname === "api.testnet.hiro.so") ||
      (name === "testnet" && ["api.hiro.so", "api.mainnet.hiro.so"].includes(url.hostname))) {
    throw new Error("STACKS_API_URL does not match STACKS_NETWORK");
  }
  return { name, api: api.replace(/\/+$/, ""), deployer };
}

export const chainNetwork = validateNetworkConfig(process.env);
