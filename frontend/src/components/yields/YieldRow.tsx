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
  return `$${usd}`;
}

function StaleBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "oklch(65% .19 22/.12)",
        border: "1px solid oklch(65% .19 22/.3)",
        borderRadius: 5,
        padding: "2px 7px",
        fontFamily: "'Space Mono', monospace",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "var(--red)",
        marginTop: 4,
      }}
    >
      STALE
    </div>
  );
}

function isApyStale(data: NormalizedYield): boolean {
  if (data.apy_stale) return true;
  return Date.now() - data.fetched_at > 60 * 60 * 1000;
}

function ApyNum({ apy, delay = 0 }: { apy: number; delay?: number }) {
  const val = useCountUp(apy, 900, delay);
  return (
    <div style={{ minWidth: 76 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--green)",
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
          color: "var(--muted)",
          letterSpacing: ".08em",
          marginTop: 3,
        }}
      >
        APY
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

  const handleDeposit = () => {
    if (stale) return;
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
          borderRadius: 13,
          background: hover ? "var(--bg3)" : "var(--bg2)",
          border: isBest
            ? "1px solid oklch(68% .19 52/.28)"
            : "1px solid var(--border)",
          transition: "background .18s, border-color .18s",
          position: "relative",
          overflow: "hidden",
          animation: isBest ? "glowRow 3.5s 0.5s ease-in-out infinite" : undefined,
        }}
      >
        {isBest && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              background: "oklch(68% .19 52/.1)",
              borderBottom: "1px solid oklch(68% .19 52/.2)",
              borderRight: "1px solid oklch(68% .19 52/.2)",
              borderRadius: "0 0 7px 0",
              padding: "2px 8px",
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: ".1em",
              color: "var(--amber)",
            }}
          >
            BEST RATE
          </div>
        )}

        {/* Rank — hidden on mobile */}
        <div
          className="hidden md:block"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "var(--lo)",
            minWidth: 18,
            textAlign: "center",
            marginTop: isBest ? 10 : 0,
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
          }}
        >
          {meta.abbr}
        </div>

        {/* Protocol name */}
        <div style={{ minWidth: 88, flex: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{meta.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            sBTC · Reward
          </div>
        </div>

        <div>
          <ApyNum apy={data.apy_percent} delay={index * 90} />
          {isApyStale(data) && <StaleBadge />}
        </div>

        <div style={{ minWidth: 50 }}>
          <RiskBadge level={data.risk_level} />
        </div>

        {/* TVL — hidden on small screens */}
        <div className="hidden sm:block" style={{ minWidth: 70 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatTvl(data.tvl_usd)}
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              color: "var(--muted)",
              marginTop: 2,
              letterSpacing: ".05em",
            }}
          >
            TVL
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleDeposit}
          disabled={stale}
          title={stale ? "APY data is stale — deposits paused" : undefined}
          style={{
            background: stale ? "transparent" : isBest ? "var(--amber)" : "transparent",
            color: stale ? "var(--lo)" : isBest ? "#000" : "var(--amber)",
            border: `1.5px solid ${stale ? "var(--border)" : "var(--amber)"}`,
            borderRadius: 9,
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            padding: "9px 20px",
            cursor: stale ? "not-allowed" : "pointer",
            flexShrink: 0,
            opacity: stale ? 0.45 : 1,
            transition: "background .15s, color .15s, opacity .15s",
          }}
          onMouseOver={(e) => {
            if (stale) return;
            e.currentTarget.style.background = "var(--amber)";
            e.currentTarget.style.color = "#000";
          }}
          onMouseOut={(e) => {
            if (stale) return;
            e.currentTarget.style.background = isBest ? "var(--amber)" : "transparent";
            e.currentTarget.style.color = isBest ? "#000" : "var(--amber)";
          }}
        >
          {isConnected ? "Deposit" : "Connect"}
        </button>
      </div>

      {depositOpen && (
        <DepositModal data={data} onClose={() => setDepositOpen(false)} />
      )}
    </>
  );
}
