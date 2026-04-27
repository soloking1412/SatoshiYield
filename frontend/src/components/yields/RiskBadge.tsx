import { clsx } from "clsx";
import type { RiskLevel } from "../../types/yield.js";

const LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

const STYLES: Record<RiskLevel, string> = {
  low: "bg-risk-low/10 text-risk-low",
  medium: "bg-risk-medium/10 text-risk-medium",
  high: "bg-risk-high/10 text-risk-high",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded text-xs font-medium",
        STYLES[level]
      )}
    >
      {LABELS[level]}
    </span>
  );
}
