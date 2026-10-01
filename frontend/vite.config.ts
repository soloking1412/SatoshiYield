import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const network = process.env.VITE_NETWORK ?? env.VITE_NETWORK;
  return {
  // Mainnet and testnet previews must not invalidate each other's optimized
  // dependencies when both dev servers run from this checkout.
  cacheDir: `node_modules/.vite-${network === "testnet" ? "testnet" : "mainnet"}`,
  plugins: [react()],
  // Note: Vite 8 (rolldown) already code-splits vendors and lazy-loaded wallet
  // modals into separate chunks automatically, so no manual chunking is needed.
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  };
});
