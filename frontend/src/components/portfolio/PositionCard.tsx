import type { UserPosition } from "../../types/position.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useWithdraw } from "../../hooks/useWithdraw.js";
import {
  useRequestWithdraw,
  useClaimWithdraw,
  useCancelWithdraw,
} from "../../hooks/useAsyncWithdraw.js";
import { useYields } from "../../hooks/useYields.js";
import { useCountUp } from "../../hooks/useCountUp.js";

function formatSats(sats: bigint): string {
  return (Number(sats) / 1e8).toFixed(6);
}

const btn = (primary: boolean): React.CSSProperties => ({
  flex: 1,
  padding: 13,
  borderRadius: "var(--r)",
  cursor: "pointer",
  background: primary ? "var(--accent)" : "var(--bg3)",
  border: primary ? "1.5px solid var(--accent)" : "1px solid var(--border)",
  color: primary ? "var(--onAccent)" : "var(--muted)",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 14,
  fontWeight: primary ? 700 : 500,
});

export function PositionCard({ position }: { position: UserPosition }) {
  const meta = PROTOCOLS[position.protocol];
  const withdraw = useWithdraw();
  const requestW = useRequestWithdraw();
  const claimW = useClaimWithdraw();
  const cancelW = useCancelWithdraw();
  const { data: yields } = useYields();
  const yieldData = yields?.find((y) => y.protocol === position.protocol);
  const apy = yieldData?.apy_percent ?? 0;
  const tvl = yieldData?.tvl_usd ?? 0;
  const risk = yieldData?.risk_level;

  const earned = useCountUp(0, 1200, 200);
  const pending = position.isAsync && position.status === "pending";
  const busy = withdraw.isPending || requestW.isPending || claimW.isPending || cancelW.isPending;

  const riskLabel = risk === "medium" ? "Med" : risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : "—";
  const riskColor = risk === "low" ? "var(--pos)" : risk === "high" ? "var(--neg)" : "var(--warn)";

  function formatTvl(usd: number): string {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return usd > 0 ? `$${usd}` : "—";
  }

  return (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        boxShadow: "0 0 40px -8px var(--glow)",
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
            width: 44, height: 44, borderRadius: "50%", background: meta.color,
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, color: "#fff",
          }}
        >
          {meta.abbr}
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 3 }}>{meta.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: pending ? "var(--warn)" : "var(--pos)",
              animation: "pulseDot 2s infinite",
            }} />
            <span style={{ fontSize: 12, color: pending ? "var(--warn)" : "var(--pos)" }}>
              {pending ? "Withdrawal pending" : "Active position"}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700,
            letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
          }}>
            {formatSats(position.principalSats)}{" "}
            <span style={{ color: "var(--accent)" }}>sBTC</span>
          </div>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--muted)",
            marginTop: 3, letterSpacing: ".06em",
          }}>
            PRINCIPAL
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {[
          ["APY",    apy ? `${apy.toFixed(1)}%` : "—",  "var(--pos)", "border-r border-b sm:border-b-0 [border-color:var(--border)]"],
          ["REALIZED", `+${earned.toFixed(6)} sBTC`,     "var(--pos)", "border-b sm:border-r sm:border-b-0 [border-color:var(--border)]"],
          ["RISK",   riskLabel,                          riskColor,      "border-r [border-color:var(--border)]"],
          ["TVL",    formatTvl(tvl),                     "var(--text)",  ""],
        ].map(([label, value, color, borderCls]) => (
          <div key={label} className={borderCls as string} style={{ padding: "14px 18px" }}>
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9, color: "var(--lo)",
              letterSpacing: ".1em", marginBottom: 5,
            }}>
              {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: color as string, fontVariantNumeric: "tabular-nums" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Async pending notice */}
      {pending && (
        <div style={{
          padding: "14px 24px", borderTop: "1px solid var(--border)",
          fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5,
        }}>
          Your redemption has been requested. Hermetica funds redemptions after a short cooldown —
          claim once it's ready, or cancel anytime to keep your hBTC position.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, padding: "18px 24px", flexWrap: "wrap" }}>
        {!position.isAsync && (
          <button
            onClick={() => withdraw.mutate({ adapter: position.adapter })}
            disabled={busy}
            style={{ ...btn(true), opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {withdraw.isPending ? "Withdrawing…" : "Withdraw"}
          </button>
        )}

        {position.isAsync && !pending && (
          <button
            onClick={() => requestW.mutate({ adapter: position.adapter })}
            disabled={busy}
            style={{ ...btn(true), opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {requestW.isPending ? "Requesting…" : "Request Withdrawal"}
          </button>
        )}

        {position.isAsync && pending && (
          <>
            <button
              onClick={() => claimW.mutate({ adapter: position.adapter })}
              disabled={busy}
              style={{ ...btn(true), opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer" }}
            >
              {claimW.isPending ? "Claiming…" : "Claim"}
            </button>
            <button
              onClick={() => cancelW.mutate({ adapter: position.adapter })}
              disabled={busy}
              style={{ ...btn(false), opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer" }}
            >
              {cancelW.isPending ? "Cancelling…" : "Cancel"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
