import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "var(--amber)",
          "orange-dim": "var(--amberB)",
        },
        surface: {
          base: "var(--bg)",
          card: "var(--cardBg)",
          border: "var(--border)",
          hover: "var(--bg3)",
        },
        text: {
          primary: "var(--text)",
          secondary: "var(--muted)",
          muted: "var(--lo)",
        },
        yield: {
          green: "var(--green)",
          "green-dim": "var(--green)",
        },
        risk: {
          low: "var(--green)",
          medium: "var(--yellow)",
          high: "var(--red)",
        },
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'Space Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
