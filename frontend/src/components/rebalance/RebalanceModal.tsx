import { useState } from "react";
import type { ProtocolId } from "../../types/yield.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useRebalance } from "../../hooks/useRebalance.js";
import { useYields } from "../../hooks/useYields.js";
import { MarkSC } from "../shared/MarkSC.js";
import { RiskBadge } from "../yields/RiskBadge.js";

interface Props {
  open: boolean;
  onClose: () => void;
  currentProtocol: ProtocolId;
}

const fillBtn: React.CSSProperties = {
  background: "var(--amber)",
  color: "#000",
  border: "none",
  borderRadius: 10,
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 14,
  fontWeight: 700,
  padding: "13px 20px",
  cursor: "pointer",
  flex: 1,
  transition: "opacity .15s",
};

const ghostBtn: React.CSSProperties = {
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  color: "var(--muted)",
  borderRadius: 10,
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 14,
  fontWeight: 500,
  padding: "13px 20px",
  cursor: "pointer",
};

export function RebalanceModal({ open, onClose, currentProtocol }: Props) {
  const { data: yields } = useYields();
  const rebalance = useRebalance();
  const [selected, setSelected] = useState<ProtocolId | null>(null);

  if (!open) return null;

  const cur = PROTOCOLS[currentProtocol];
  const curYield = yields?.find((y) => y.protocol === currentProtocol);
  const options = (yields ?? []).filter((y) => y.protocol !== currentProtocol);

  const handleConfirm = () => {
    if (!selected) return;
    rebalance.mutate({ from: currentProtocol, to: selected }, { onSuccess: onClose });
  };

  const Overlay = ({ children }: { children: React.ReactNode }) => (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--modalBg)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn .2s ease",
      }}
    >
      <div
        style={{
          background: "var(--cardBg)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "30px 24px",
          width: "100%",
          maxWidth: 420,
          animation: "modalUp .3s cubic-bezier(.34,1.56,.64,1) both",
          boxShadow: "var(--shadow)",
        }}
      >
        {children}
      </div>
    </div>
  );

  if (rebalance.isSuccess) {
    return (
      <Overlay>
        <div style={{ textAlign: "center", padding: "16px 0", animation: "fadeIn .4s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "oklch(68% .18 145/.12)",
                border: "2px solid oklch(68% .18 145/.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "checkIn .5s cubic-bezier(.34,1.56,.64,1) both",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5 9-9" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Rebalanced</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Moved to {selected ? PROTOCOLS[selected]?.name : "new protocol"}
          </div>
        </div>
      </Overlay>
    );
  }

  if (rebalance.isPending) {
    return (
      <Overlay>
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <MarkSC size={48} pulse />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Broadcasting…</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Moving to {selected ? PROTOCOLS[selected]?.name : "new protocol"}
          </div>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <h2
        style={{
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 6,
          margin: "0 0 6px",
        }}
      >
        Rebalance Position
      </h2>
      <p
        style={{
          color: "var(--muted)",
          fontSize: 13,
          lineHeight: 1.6,
          marginBottom: 22,
          margin: "0 0 22px",
        }}
      >
        Move from{" "}
        <strong style={{ color: "var(--text)" }}>{cur.name}</strong>
        {curYield && ` (${curYield.apy_percent.toFixed(1)}% APY)`} to a higher-yielding protocol.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {options.map((y) => {
          const pmeta = PROTOCOLS[y.protocol];
          const isSelected = selected === y.protocol;
          const gain = curYield ? (y.apy_percent - curYield.apy_percent).toFixed(1) : null;
          return (
            <div
              key={y.protocol}
              onClick={() => setSelected(y.protocol)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                borderRadius: 12,
                cursor: "pointer",
                background: isSelected ? "oklch(68% .19 52/0.08)" : "var(--bg3)",
                border: isSelected
                  ? "1.5px solid oklch(68% .19 52/.5)"
                  : "1.5px solid var(--border)",
                transition: "all .15s",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: pmeta.color,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {pmeta.abbr}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{pmeta.name}</div>
                <RiskBadge level={y.risk_level} />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: "var(--green)" }}>
                  {y.apy_percent.toFixed(1)}%
                </div>
                {gain && parseFloat(gain) > 0 && (
                  <div
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 9,
                      color: "var(--green)",
                      marginTop: 2,
                    }}
                  >
                    +{gain}% vs current
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rebalance.isError && (
        <p style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 14 }}>
          Transaction failed. Please try again.
        </p>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={ghostBtn}>
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selected || rebalance.isPending}
          style={{
            ...fillBtn,
            opacity: !selected || rebalance.isPending ? 0.45 : 1,
            cursor: !selected ? "default" : "pointer",
          }}
        >
          Confirm Rebalance
        </button>
      </div>
    </Overlay>
  );
}
