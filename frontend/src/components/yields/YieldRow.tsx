import { useState } from "react";
import type { NormalizedYield } from "../../types/yield.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { RiskBadge } from "./RiskBadge.js";
import { useWallet } from "../../context/WalletContext.js";
import { useConnectModal } from "../../context/ConnectModalContext.js";
import { DepositModal } from "../wallet/DepositModal.js";
import { useCountUp } from "../../hooks/useCountUp.js";

function formatTvl(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return usd > 0 ? `$${usd}` : "—";
}

function StaleBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "color-mix(in oklch, var(--neg) 12%, transparent)",
        border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)",
        borderRadius: "var(--r-sm)",
        padding: "2px 7px",
        fontFamily: "'Space Mono', monospace",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "var(--neg)",
        marginTop: 4,
      }}
    >
      STALE
    </div>
  );
}

function LiveBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "color-mix(in oklch, var(--pos) 12%, transparent)",
        border: "1px solid color-mix(in oklch, var(--pos) 30%, transparent)",
        borderRadius: "var(--r-sm)",
        padding: "2px 8px",
        fontFamily: "'Space Mono', monospace",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "var(--pos)",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--pos)", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
      LIVE YIELD
    </div>
  );
}

function RefRateBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "color-mix(in oklch, var(--warn) 10%, transparent)",
        border: "1px solid color-mix(in oklch, var(--warn) 25%, transparent)",
        borderRadius: "var(--r-sm)",
        padding: "2px 8px",
        fontFamily: "'Space Mono', monospace",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "var(--warn)",
      }}
    >
      MARKET RATE
    </div>
  );
}

function isApyStale(data: NormalizedYield): boolean {
  if (data.apy_stale) return true;
  return Date.now() - data.fetched_at > 60 * 60 * 1000;
}

function ApyNum({
  apy,
  delay = 0,
  color = "var(--pos)",
  label = "APY",
}: {
  apy: number;
  delay?: number;
  color?: string;
  label?: string;
}) {
  const val = useCountUp(apy, 900, delay);
  return (
    <div style={{ minWidth: 76 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {val.toFixed(1)}%
      </div>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: "var(--lo)",
          letterSpacing: ".08em",
          marginTop: 3,
        }}
      >
        {label}
      </div>
    </div>
  );
}

interface Props {
  data: NormalizedYield;
  index: number;
  isBest: boolean;
}

export function YieldRow({ data, index, isBest }: Props) {
  const meta = PROTOCOLS[data.protocol];
  const { isConnected } = useWallet();
  const { openConnectModal } = useConnectModal();
  const [depositOpen, setDepositOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const stale = isApyStale(data);
  const isLive = meta.status === "live-yield";
  const kindLabel = meta.kind === "lending" ? "sBTC · Earn" : "sBTC · LP";

  const handleDeposit = () => {
    if (stale && isLive) return;
    if (!isConnected) {
      openConnectModal();
      return;
    }
    setDepositOpen(true);
  };

  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 22px",
          borderRadius: "var(--r)",
          background: hover ? "var(--bg3)" : isBest ? "color-mix(in oklch, var(--accentD) 60%, var(--bg2))" : "var(--bg2)",
          border: isBest
            ? "1px solid color-mix(in oklch, var(--accent) 30%, transparent)"
            : "1px solid var(--border)",
          transition: "background .18s, border-color .18s",
          position: "relative",
          overflow: "hidden",
          animation: isBest ? "glowRow 3.5s 0.5s ease-in-out infinite" : undefined,
        }}
      >
        {/* Best rate corner tag */}
        {isBest && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              background: "var(--accentD)",
              borderBottom: "1px solid color-mix(in oklch, var(--accent) 25%, transparent)",
              borderRight: "1px solid color-mix(in oklch, var(--accent) 25%, transparent)",
              borderRadius: "0 0 var(--r-sm) 0",
              padding: "3px 9px",
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: ".1em",
              color: "var(--accent)",
            }}
          >
            ★ BEST RATE
          </div>
        )}

        {/* Rank */}
        <div
          className="hidden md:block"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "var(--lo)",
            minWidth: 18,
            textAlign: "center",
            marginTop: isBest ? 12 : 0,
          }}
        >
          #{index + 1}
        </div>

        {/* Protocol icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: meta.color,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.02em",
            boxShadow: `0 2px 8px color-mix(in oklch, ${meta.color} 40%, transparent)`,
          }}
        >
          {meta.abbr}
        </div>

        {/* Protocol name + kind */}
        <div style={{ minWidth: 88, flex: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{meta.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {kindLabel}
          </div>
        </div>

        {/* APY + status badge */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ApyNum
            apy={data.apy_percent}
            delay={index * 90}
            color={isLive ? "var(--pos)" : "var(--muted)"}
            label={isLive ? "APY" : "MARKET RATE"}
          />
          {stale && isLive ? <StaleBadge /> : isLive ? <LiveBadge /> : <RefRateBadge />}
        </div>

        {/* Risk */}
        <div style={{ minWidth: 50 }}>
          <RiskBadge level={data.risk_level} />
        </div>

        {/* TVL */}
        <div className="hidden sm:block" style={{ minWidth: 70 }}>
          <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {formatTvl(data.tvl_usd)}
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "var(--muted)", marginTop: 2, letterSpacing: ".05em" }}>
            TVL
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Action button */}
        {isLive ? (
          <button
            onClick={handleDeposit}
            disabled={stale}
            title={stale ? "APY data is stale — deposits paused" : undefined}
            style={{
              background: stale ? "transparent" : isBest ? "var(--accent)" : "transparent",
              color: stale ? "var(--lo)" : isBest ? "var(--onAccent)" : "var(--accent)",
              border: `1.5px solid ${stale ? "var(--border)" : "var(--accent)"}`,
              borderRadius: "var(--r-sm)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              padding: "9px 20px",
              cursor: stale ? "not-allowed" : "pointer",
              flexShrink: 0,
              opacity: stale ? 0.45 : 1,
              transition: "background .15s, color .15s, transform .12s",
            }}
            onMouseOver={(e) => {
              if (stale) return;
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.color = "var(--onAccent)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              if (stale) return;
              e.currentTarget.style.background = isBest ? "var(--accent)" : "transparent";
              e.currentTarget.style.color = isBest ? "var(--onAccent)" : "var(--accent)";
              e.currentTarget.style.transform = "none";
            }}
          >
            {isConnected ? "Deposit" : "Connect"}
          </button>
        ) : (
          <button
            onClick={handleDeposit}
            style={{
              background: "transparent",
              color: "var(--lo)",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--r-sm)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              padding: "9px 18px",
              cursor: "pointer",
              flexShrink: 0,
              transition: "border-color .15s, color .15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--lo)";
            }}
          >
            Details →
          </button>
        )}
      </div>

      {depositOpen && (
        <DepositModal data={data} onClose={() => setDepositOpen(false)} />
      )}
    </>
  );
}
