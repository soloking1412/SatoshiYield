import { describe, expect, it } from "vitest";
import { validateNetworkConfig } from "../src/network.js";
const mainnet = { STACKS_NETWORK: "mainnet", STACKS_API_URL: "https://api.hiro.so", DEPLOYER_ADDRESS: "SP000000000000000000002Q6VF78" };

describe("network identity configuration", () => {
  it("requires an explicit network", () => expect(() => validateNetworkConfig({ ...mainnet, STACKS_NETWORK: undefined })).toThrow());
  it("rejects a foreign-network deployer", () => expect(() => validateNetworkConfig({ ...mainnet, DEPLOYER_ADDRESS: "ST000000000000000000002AMW42H" })).toThrow());
  it("rejects a principal with a false checksum", () => expect(() => validateNetworkConfig({ ...mainnet, DEPLOYER_ADDRESS: "SP000000000000000000002AMW42H" })).toThrow());
  it("rejects a testnet API on mainnet", () => expect(() => validateNetworkConfig({ ...mainnet, STACKS_API_URL: "https://api.testnet.hiro.so" })).toThrow());
  it("rejects insecure mainnet transport", () => expect(() => validateNetworkConfig({ ...mainnet, STACKS_API_URL: "http://api.hiro.so" })).toThrow());
  it("rejects embedded credentials", () => expect(() => validateNetworkConfig({ ...mainnet, STACKS_API_URL: "https://user:pass@api.hiro.so" })).toThrow());
  it("allows a local testnet node", () => expect(validateNetworkConfig({ STACKS_NETWORK: "testnet", STACKS_API_URL: "http://localhost:3999/", DEPLOYER_ADDRESS: "ST000000000000000000002AMW42H" })).toMatchObject({ api: "http://localhost:3999", name: "testnet" }));
});
