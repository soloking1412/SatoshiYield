import type { RiskLevel } from "../../types/yield.js";

const MAP: Record<RiskLevel, [string, string, string]> = {
  low:    ["var(--accent2D)", "var(--accent2)", "color-mix(in oklch, var(--accent2) 30%, transparent)"],
  medium: ["color-mix(in oklch, var(--warn) 14%, transparent)", "var(--warn)", "color-mix(in oklch, var(--warn) 28%, transparent)"],
  high:   ["color-mix(in oklch, var(--neg) 14%, transparent)",  "var(--neg)",  "color-mix(in oklch, var(--neg) 30%, transparent)"],
};

const LABEL: Record<RiskLevel, string> = { low: "Low", medium: "Med", high: "High" };

export function RiskBadge({ level }: { level: RiskLevel }) {
  const [bg, color, border] = MAP[level] ?? MAP.medium;
  return (
    <span
      style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".06em",
        background: bg,
        color,
        border: `1px solid ${border}`,
        padding: "2px 8px",
        borderRadius: "var(--r-sm)",
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {LABEL[level]}
    </span>
  );
}
