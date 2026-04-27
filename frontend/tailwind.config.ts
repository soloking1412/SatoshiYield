import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#F7931A",
          "orange-dim": "#C5740F",
        },
        surface: {
          base: "#0D0D0D",
          card: "#141414",
          border: "#222222",
          hover: "#1C1C1C",
        },
        text: {
          primary: "#FAFAFA",
          secondary: "#9A9A9A",
          muted: "#555555",
        },
        yield: {
          green: "#22C55E",
          "green-dim": "#16A34A",
        },
        risk: {
          low: "#22C55E",
          medium: "#F59E0B",
          high: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
