import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
});
