import { useState, useRef, useEffect } from "react";
import type { NormalizedYield, RiskLevel } from "../../types/yield.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useDeposit } from "../../hooks/useDeposit.js";
import { useBalance } from "../../hooks/useBalance.js";
import { usePositions } from "../../hooks/usePositions.js";
import { useHbtcCapacity } from "../../hooks/useHbtcCapacity.js";
import { SBTC_BRIDGE_URL } from "../../constants/links.js";
import { networkName } from "../../lib/stacksClient.js";

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
    low:    ["var(--accent2D)", "var(--accent2)", "color-mix(in oklch, var(--accent2) 30%, transparent)"],
    medium: ["color-mix(in oklch, var(--warn) 12%, transparent)", "var(--warn)", "color-mix(in oklch, var(--warn) 28%, transparent)"],
    high:   ["color-mix(in oklch, var(--neg) 14%, transparent)", "var(--neg)", "color-mix(in oklch, var(--neg) 30%, transparent)"],
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
  background: "var(--accent)",
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

const MIN_BTC = 0.00001;

function formatBtc(sats: bigint): string {
  return (Number(sats) / 1e8).toFixed(8).replace(/\.?0+$/, "") || "0";
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
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
}

interface Props {
  data: NormalizedYield;
  onClose: () => void;
}

export function DepositModal({ data, onClose }: Props) {
  const [step, setStep] = useState<"amount" | "confirm">("amount");
  const [amount, setAmount] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deposit = useDeposit();
  const { data: balanceSats = 0n } = useBalance();
  const { data: existingPosition } = usePositions();
  const meta = PROTOCOLS[data.protocol];
  // hBTC capacity check — re-enable when "hbtc" is added back to PROTOCOLS.
  const isHbtc = false;
  const { data: hbtcCap } = useHbtcCapacity(isHbtc);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const amtNum = parseFloat(amount) || 0;
  const yearly = (amtNum * data.apy_percent / 100).toFixed(6);
  const balanceBtc = Number(balanceSats) / 1e8;
  const amountSats = BigInt(Math.round(amtNum * 1e8));
  // hBTC enforces a deposit cap on its vault; warn before the tx reverts (u103001).
  const overCapacity =
    isHbtc && !!hbtcCap && amtNum > 0 && amountSats > hbtcCap.headroomSats;
  const capacityError = overCapacity
    ? hbtcCap!.headroomSats === 0n
      ? "Hermetica hBTC is at capacity — please try again later"
      : `hBTC has only ~${(Number(hbtcCap!.headroomSats) / 1e8).toFixed(4)} sBTC capacity left`
    : null;
  const amountError =
    amtNum > 0 && amtNum < MIN_BTC
      ? `Minimum ${MIN_BTC} sBTC`
      : amtNum > balanceBtc && balanceBtc > 0
      ? "Insufficient balance"
      : capacityError;
  const canProceed = amtNum >= MIN_BTC && amtNum <= balanceBtc && !amountError;

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

  if (currentStep === "success") {
    return (
      <Overlay onClose={onClose}>
        <div style={{ textAlign: "center", padding: "20px 0", animation: "fadeIn .4s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--accent2D)",
                border: "2px solid color-mix(in oklch, var(--accent2) 40%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "checkIn .5s cubic-bezier(.34,1.56,.64,1) both",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5 9-9" stroke="var(--pos)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Deposited!</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 6 }}>
            <strong style={{ color: "var(--text)" }}>{amount} sBTC</strong> deposited to {meta.name}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>
            {meta.kind === "lending"
              ? `Earning ~${data.apy_percent.toFixed(1)}% APY · real sBTC yield via ${meta.name} lending.`
              : `Earning ~${data.apy_percent.toFixed(1)}% target · ${meta.name} managed strategy. Withdrawals are processed in two steps.`}
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
                href={`https://explorer.hiro.so/txid/${deposit.data}?chain=${networkName}`}
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
      <Overlay onClose={onClose}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "3px solid var(--bg4)",
                borderTopColor: "var(--accent)",
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
      <Overlay onClose={onClose}>
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
            ["Market APY", <span style={{ color: "var(--pos)", fontWeight: 700 }}>{data.apy_percent.toFixed(1)}%</span>],
            ["At market rate / yr", <span style={{ color: "var(--pos)" }}>~{yearly} sBTC</span>],
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
        {meta.principalProtected ? (
          <div
            style={{
              background: "color-mix(in oklch, var(--warn) 8%, transparent)",
              border: "1px solid color-mix(in oklch, var(--warn) 25%, transparent)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 22,
            }}
          >
            <span style={{ fontSize: 12, color: "oklch(72% .14 82)" }}>
              Principal-protected beta — your sBTC is returned in full on withdraw.
              Your Stacks wallet will prompt you to sign this transaction.
            </span>
          </div>
        ) : (
          <div
            style={{
              background: "color-mix(in oklch, var(--neg) 10%, transparent)",
              border: "1px solid color-mix(in oklch, var(--neg) 35%, transparent)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 22,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--neg)", marginBottom: 4 }}>
              Not principal-guaranteed — managed strategy
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              {meta.blurb}
            </span>
          </div>
        )}
        {deposit.isError && (
          <div style={{ fontSize: 12, color: "var(--neg)", marginBottom: 14, textAlign: "center" }}>
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

  // Block if user already has an active position (vault enforces 1 position per user)
  if (existingPosition) {
    const inSamePool = existingPosition.protocol === data.protocol;
    return (
      <Overlay onClose={onClose}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            {inSamePool ? "Already in this pool" : "Position already active"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, marginBottom: 24 }}>
            {inSamePool
              ? <>
                  You already have an active deposit in <strong style={{ color: "var(--text)" }}>{meta.name}</strong>.
                  Withdraw first, then deposit again.
                </>
              : <>
                  You have an active position in{" "}
                  <strong style={{ color: "var(--text)" }}>{PROTOCOLS[existingPosition.protocol].name}</strong>.
                  {" "}Withdraw it first, then deposit here.
                </>
            }
          </div>
          <button onClick={onClose} style={{ ...fillBtn, maxWidth: 160, margin: "0 auto", display: "block" }}>
            Got it
          </button>
        </div>
      </Overlay>
    );
  }

  // Amount step
  return (
    <Overlay onClose={onClose}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "var(--lo)",
              letterSpacing: ".1em",
            }}
          >
            AMOUNT
          </label>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: balanceSats === 0n ? "var(--neg)" : "var(--muted)" }}>
              Balance: {formatBtc(balanceSats)} sBTC
            </span>
            {(balanceSats === 0n || amountError === "Insufficient balance") && (
              <a
                href={SBTC_BRIDGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
              >
                Get sBTC ↗
              </a>
            )}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg3)",
            border: `1.5px solid ${focused ? "var(--accent)" : amountError ? "var(--neg)" : "var(--border)"}`,
            borderRadius: 10,
            overflow: "hidden",
            transition: "border .15s",
          }}
        >
          <input
            ref={inputRef}
            type="number"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            step="0.00001"
            min={MIN_BTC}
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
                color: "var(--accent)",
                fontWeight: 700,
              }}
            >
              sBTC
            </span>
            <button
              onClick={() => setAmount(formatBtc(balanceSats))}
              disabled={balanceSats === 0n}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                letterSpacing: ".08em",
                background: "var(--accentD)",
                color: "var(--accent)",
                border: "none",
                borderRadius: 5,
                padding: "3px 7px",
                cursor: balanceSats === 0n ? "not-allowed" : "pointer",
                fontWeight: 700,
                opacity: balanceSats === 0n ? 0.4 : 1,
              }}
            >
              MAX
            </button>
          </div>
        </div>
        {amountError && (
          <div style={{ fontSize: 11, color: "var(--neg)", marginTop: 6 }}>{amountError}</div>
        )}
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
          <span style={{ fontSize: 13, color: "var(--muted)" }}>At current market rate / yr</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pos)" }}>
            {amtNum > 0 ? `~${yearly} sBTC` : "—"}
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
          disabled={!canProceed}
          style={{ ...fillBtn, opacity: canProceed ? 1 : 0.5 }}
        >
          Review →
        </button>
      </div>
    </Overlay>
  );
}
