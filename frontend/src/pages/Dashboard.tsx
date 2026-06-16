import { useWallet } from "../context/WalletContext.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { YieldTable } from "../components/yields/YieldTable.js";

export function Dashboard() {
  const { isConnected } = useWallet();
  const { openConnectModal } = useConnectModal();

  return (
    <main
      className="pb-20 sm:pb-10"
      style={{ maxWidth: 920, margin: "0 auto", paddingTop: 44, paddingLeft: 24, paddingRight: 24 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                whiteSpace: "nowrap",
                margin: 0,
              }}
            >
              Live Yields
            </h1>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
            Every sBTC rate on Stacks, in one place — refreshed every 5 minutes.
            {!isConnected && (
              <>
                {" "}
                <button
                  onClick={openConnectModal}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontSize: "inherit",
                    fontFamily: "inherit",
                  }}
                >
                  Connect to deposit in two taps.
                </button>
              </>
            )}
          </p>
        </div>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "var(--lo)",
            textAlign: "right",
            lineHeight: 1.8,
          }}
        >
          Live rates
          <br />
          sorted by APY
        </div>
      </div>

      <div
        role="note"
        style={{
          background: "color-mix(in oklch, var(--neg) 7%, transparent)",
          border: "1px solid color-mix(in oklch, var(--neg) 28%, transparent)",
          borderRadius: "var(--r)",
          padding: "12px 16px",
          marginBottom: 22,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--muted)",
        }}
      >
        <strong style={{ color: "var(--neg)" }}>Audit-pending beta — deposit at your own risk.</strong>{" "}
        Zest is a lending market (principal-protected: you get your sBTC + interest back).
        Hermetica hBTC is a{" "}
        <strong style={{ color: "var(--text)" }}>
          managed strategy (not principal-guaranteed)
        </strong>{" "}
        — a small exit fee applies, withdrawals are funded by Hermetica after a cooldown, and a
        redemption can return less sBTC than you deposited. The vault and adapters are not yet
        externally audited. Only deposit what you can afford to lose.
      </div>

      <YieldTable />
    </main>
  );
}
