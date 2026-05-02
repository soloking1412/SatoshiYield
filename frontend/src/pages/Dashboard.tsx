import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { YieldTable } from "../components/yields/YieldTable.js";

function LiveBadge() {
  const [minutes, setMinutes] = useState(3);
  useEffect(() => {
    const t = setInterval(() => setMinutes((m) => m + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--green)",
          flexShrink: 0,
          animation: "pulseDot 1.8s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          color: "var(--muted)",
          letterSpacing: ".05em",
        }}
      >
        LIVE · {minutes}m ago
      </span>
    </div>
  );
}

export function Dashboard() {
  const { isConnected } = useWallet();
  const { openConnectModal } = useConnectModal();

  return (
    <main
      className="pb-20 sm:pb-10"
      style={{ maxWidth: 900, margin: "0 auto", paddingTop: 44, paddingLeft: 24, paddingRight: 24 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 30,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 8,
            }}
          >
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
            <LiveBadge />
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
            sBTC yield rates across Stacks DeFi protocols, updated every 5 minutes.
            {!isConnected && (
              <>
                {" "}
                <button
                  onClick={openConnectModal}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--amber)",
                    cursor: "pointer",
                    fontSize: "inherit",
                    fontFamily: "inherit",
                  }}
                >
                  Connect your wallet to deposit.
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
          4 protocols
          <br />
          sorted by APY
        </div>
      </div>

      <YieldTable />
    </main>
  );
}
