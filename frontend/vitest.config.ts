import { defineConfig } from "vitest/config";

// The Mainnet-beta build hard-requires these env vars (lib/stacksClient.ts and
// constants/contracts.ts throw without them). Inject test-only mainnet values so
// the suite can import components that transitively load those modules.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
