import { defineConfig } from "vitest/config";

// Tests transitively import src/fetchers/chain.ts, which now throws at module
// load if STACKS_API_URL or DEPLOYER_ADDRESS are unset. Populate them here
// before any source module evaluates.
process.env["STACKS_API_URL"] = "https://api.hiro.so";
process.env["STACKS_NETWORK"] = "mainnet";
process.env["DEPLOYER_ADDRESS"] = "SP000000000000000000002Q6VF78";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
