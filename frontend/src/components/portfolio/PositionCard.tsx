import { useState } from "react";
import type { UserPosition } from "../../types/position.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useWithdraw } from "../../hooks/useWithdraw.js";
import { useYields } from "../../hooks/useYields.js";
import { RebalanceModal } from "../rebalance/RebalanceModal.js";
import { useCountUp } from "../../hooks/useCountUp.js";

function formatSats(sats: bigint): string {
  return (Number(sats) / 1e8).toFixed(6);
}

function Sparkline({ apy }: { apy: number }) {
  const pts = [apy * 0.88, apy * 0.91, apy * 0.87, apy * 0.93, apy * 0.96, apy * 0.94, apy];
  const w = 80, h = 28;
  const mn = Math.min(...pts), mx = Math.max(...pts);
  const py = (v: number) => ((v - mn) / (mx - mn || 1)) * (h - 4) + 2;
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * w} ${h - py(v)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" style={{ opacity: 0.6 }}>
      <path d={d} stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PositionCard({ position }: { position: UserPosition }) {
  const meta = PROTOCOLS[position.protocol];
  const withdraw = useWithdraw();
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const { data: yields } = useYields();
  const yieldData = yields?.find((y) => y.protocol === position.protocol);
  const apy = yieldData?.apy_percent ?? 0;
  const tvl = yieldData?.tvl_usd ?? 0;
  const risk = yieldData?.risk_level;

  const earned = useCountUp(0.0034, 1200, 200);

  const riskLabel = risk === "medium" ? "Med" : risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : "—";
  const riskColor = risk === "low" ? "var(--green)" : risk === "high" ? "var(--red)" : "var(--yellow)";

  function formatTvl(usd: number): string {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return usd ? `$${usd}` : "—";
  }

  return (
    <>
      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid oklch(68% .19 52/.22)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 0 40px -8px oklch(68% .19 52/.1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 24px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: meta.color,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {meta.abbr}
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 3 }}>{meta.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--green)",
                  animation: "pulseDot 2s infinite",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--green)" }}>Active position</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatSats(position.principalSats)}{" "}
              <span style={{ color: "var(--amber)" }}>sBTC</span>
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "var(--muted)",
                marginTop: 3,
                letterSpacing: ".06em",
              }}
            >
              PRINCIPAL
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {[
            ["APY",    apy ? `${apy.toFixed(1)}%` : "—",  "var(--green)", "border-r border-b sm:border-b-0 [border-color:var(--border)]"],
            ["EARNED", `+${earned.toFixed(6)} sBTC`,       "var(--green)", "border-b sm:border-r sm:border-b-0 [border-color:var(--border)]"],
            ["RISK",   riskLabel,                          riskColor,      "border-r [border-color:var(--border)]"],
            ["TVL",    formatTvl(tvl),                     "var(--text)",  ""],
          ].map(([label, value, color, borderCls]) => (
            <div
              key={label}
              className={borderCls as string}
              style={{ padding: "14px 18px" }}
            >
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 9,
                  color: "var(--lo)",
                  letterSpacing: ".1em",
                  marginBottom: 5,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: color as string,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Sparkline */}
        {apy > 0 && (
          <div
            style={{
              padding: "14px 24px",
              borderTop: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                color: "var(--lo)",
                letterSpacing: ".08em",
              }}
            >
              7D APY
            </div>
            <Sparkline apy={apy} />
            <div style={{ flex: 1, minWidth: 100 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "oklch(68% .18 145/0.08)",
                border: "1px solid oklch(68% .18 145/0.22)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--green)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: "oklch(72% .18 145)" }}>
                Best available rate · no rebalance needed
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, padding: "18px 24px" }}>
          <button
            onClick={() => setRebalanceOpen(true)}
            style={{
              flex: 1,
              padding: 13,
              borderRadius: 10,
              cursor: "pointer",
              background: "transparent",
              border: "1.5px solid var(--amber)",
              color: "var(--amber)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              transition: "all .15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "var(--amber)";
              e.currentTarget.style.color = "#000";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--amber)";
            }}
          >
            Rebalance
          </button>
          <button
            onClick={() => withdraw.mutate({ protocol: position.protocol })}
            disabled={withdraw.isPending}
            style={{
              flex: 1,
              padding: 13,
              borderRadius: 10,
              cursor: withdraw.isPending ? "not-allowed" : "pointer",
              background: "var(--bg3)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              opacity: withdraw.isPending ? 0.5 : 1,
            }}
          >
            {withdraw.isPending ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>

        {withdraw.isError && (
          <p style={{ fontSize: 12, color: "var(--red)", textAlign: "center", padding: "0 24px 16px" }}>
            Withdrawal failed. Please try again.
          </p>
        )}
      </div>

      <RebalanceModal
        open={rebalanceOpen}
        onClose={() => setRebalanceOpen(false)}
        currentProtocol={position.protocol}
      />
    </>
  );
}
