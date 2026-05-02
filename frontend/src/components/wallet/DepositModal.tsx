import { useState, useRef, useEffect } from "react";
import type { NormalizedYield, RiskLevel } from "../../types/yield.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useDeposit } from "../../hooks/useDeposit.js";

function PIcon({ abbr, color, size = 38 }: { abbr: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.34,
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "-0.02em",
      }}
    >
      {abbr}
    </div>
  );
}

function RiskBadgeInline({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, [string, string, string]> = {
    low:    ["oklch(64% .19 150/.14)", "oklch(68% .18 150)", "oklch(64% .19 150/.3)"],
    medium: ["oklch(76% .16 82/.12)",  "oklch(72% .16 82)",  "oklch(76% .16 82/.28)"],
    high:   ["oklch(64% .19 22/.14)",  "oklch(68% .19 22)",  "oklch(64% .19 22/.3)"],
  };
  const [bg, color, border] = map[risk] ?? map.medium;
  const label = risk === "medium" ? "Med" : risk.charAt(0).toUpperCase() + risk.slice(1);
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
      }}
    >
      {label}
    </span>
  );
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
  transition: "opacity .15s",
  flex: 1,
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

interface Props {
  data: NormalizedYield;
  onClose: () => void;
}

export function DepositModal({ data, onClose }: Props) {
  const [step, setStep] = useState<"amount" | "confirm">("amount");
  const [amount, setAmount] = useState("0.001");
  const inputRef = useRef<HTMLInputElement>(null);
  const deposit = useDeposit();
  const meta = PROTOCOLS[data.protocol];

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const amtNum = parseFloat(amount) || 0;
  const yearly = (amtNum * data.apy_percent / 100).toFixed(6);

  const handleConfirm = () => {
    const sats = BigInt(Math.round(amtNum * 1e8));
    if (sats <= 0n) return;
    deposit.mutate({ protocol: data.protocol, amountSats: sats });
  };

  const currentStep = deposit.isSuccess
    ? "success"
    : deposit.isPending
    ? "pending"
    : step;

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
          padding: "28px 24px",
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

  if (currentStep === "success") {
    return (
      <Overlay>
        <div style={{ textAlign: "center", padding: "20px 0", animation: "fadeIn .4s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "oklch(68% .18 145/0.12)",
                border: "2px solid oklch(68% .18 145/0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "checkIn .5s cubic-bezier(.34,1.56,.64,1) both",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5 9-9" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Deposited!</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 6 }}>
            <strong style={{ color: "var(--text)" }}>{amount} sBTC</strong> deposited to {meta.name}
          </div>
          <div style={{ fontSize: 13, color: "var(--green)", marginBottom: 24 }}>
            Earning {data.apy_percent.toFixed(1)}% APY
          </div>
          {deposit.data && (
            <div
              style={{
                background: "var(--bg3)",
                borderRadius: 8,
                padding: "10px 14px",
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "var(--lo)",
                marginBottom: 20,
                wordBreak: "break-all",
              }}
            >
              {deposit.data}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {deposit.data && (
              <a
                href={`https://explorer.hiro.so/txid/${deposit.data}?chain=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...ghostBtn,
                  flex: 1,
                  textAlign: "center",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 11L11 1M11 1H4M11 1v7" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Explorer
              </a>
            )}
            <button onClick={onClose} style={{ ...fillBtn }}>Done</button>
          </div>
        </div>
      </Overlay>
    );
  }

  if (currentStep === "pending") {
    return (
      <Overlay>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "3px solid var(--bg4)",
                borderTopColor: "var(--amber)",
                animation: "spin .8s linear infinite",
              }}
            />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Broadcasting…</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Depositing {amount} sBTC to {meta.name}
          </div>
        </div>
      </Overlay>
    );
  }

  if (currentStep === "confirm") {
    return (
      <Overlay>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Confirm deposit</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Review your transaction before approving.
          </div>
        </div>
        <div
          style={{
            background: "var(--bg3)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 22,
          }}
        >
          {[
            ["Protocol", <div style={{ display: "flex", alignItems: "center", gap: 8 }}><PIcon abbr={meta.abbr} color={meta.color} size={22} /><span style={{ fontWeight: 600 }}>{meta.name}</span></div>],
            ["Amount",   <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{amount} sBTC</span>],
            ["APY",      <span style={{ color: "var(--green)", fontWeight: 700 }}>{data.apy_percent.toFixed(1)}%</span>],
            ["Yearly est.", <span style={{ color: "var(--green)" }}>+{yearly} sBTC</span>],
            ["Risk",     <RiskBadgeInline risk={data.risk_level} />],
          ].map(([k, v], i) => (
            <div
              key={String(k)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "13px 16px",
                borderBottom: i < 4 ? "1px solid var(--border)" : "none",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{k}</span>
              <span style={{ fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            background: "oklch(68% .16 82/0.08)",
            border: "1px solid oklch(68% .16 82/0.25)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 22,
          }}
        >
          <span style={{ fontSize: 12, color: "oklch(72% .14 82)" }}>
            Your Stacks wallet will prompt you to sign this transaction.
          </span>
        </div>
        {deposit.isError && (
          <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 14, textAlign: "center" }}>
            {deposit.error instanceof Error ? deposit.error.message : "Transaction failed. Please try again."}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep("amount")} style={ghostBtn}>← Back</button>
          <button
            onClick={handleConfirm}
            disabled={deposit.isPending}
            style={{ ...fillBtn, opacity: deposit.isPending ? 0.5 : 1 }}
          >
            Approve in Wallet
          </button>
        </div>
      </Overlay>
    );
  }

  // Amount step
  return (
    <Overlay>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <PIcon abbr={meta.abbr} color={meta.color} size={38} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Deposit to {meta.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {data.apy_percent.toFixed(1)}% APY · sBTC reward
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            color: "var(--lo)",
            letterSpacing: ".1em",
            display: "block",
            marginBottom: 8,
          }}
        >
          AMOUNT
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg3)",
            border: "1.5px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            transition: "border .15s",
          }}
          onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--amber)")}
          onBlur={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
        >
          <input
            ref={inputRef}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.001"
            min="0.001"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 20,
              fontWeight: 600,
              padding: "14px 16px",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 14 }}>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                color: "var(--amber)",
                fontWeight: 700,
              }}
            >
              sBTC
            </span>
            <button
              onClick={() => setAmount("1.000")}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                letterSpacing: ".08em",
                background: "oklch(68% .19 52/0.12)",
                color: "var(--amber)",
                border: "none",
                borderRadius: 5,
                padding: "3px 7px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              MAX
            </button>
          </div>
        </div>
      </div>
      <div
        style={{
          background: "var(--bg3)",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Estimated yearly yield</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>
            +{yearly} sBTC
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Protocol risk</span>
          <RiskBadgeInline risk={data.risk_level} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button
          onClick={() => setStep("confirm")}
          disabled={amtNum <= 0}
          style={{ ...fillBtn, opacity: amtNum <= 0 ? 0.5 : 1 }}
        >
          Review →
        </button>
      </div>
    </Overlay>
  );
}
