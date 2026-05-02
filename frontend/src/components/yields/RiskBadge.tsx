import type { RiskLevel } from "../../types/yield.js";

const MAP: Record<RiskLevel, [string, string, string, string]> = {
  low:    ["oklch(64% .19 150/.14)", "oklch(68% .18 150)", "oklch(64% .19 150/.3)", "Low"],
  medium: ["oklch(76% .16 82/.12)",  "oklch(72% .16 82)",  "oklch(76% .16 82/.28)", "Med"],
  high:   ["oklch(64% .19 22/.14)",  "oklch(68% .19 22)",  "oklch(64% .19 22/.3)",  "High"],
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const [bg, color, border, label] = MAP[level] ?? MAP.medium;
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
        borderRadius: 5,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
