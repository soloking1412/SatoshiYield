import { useWallet } from "../context/WalletContext.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { YieldTable } from "../components/yields/YieldTable.js";

function TestnetBadge() {
  return (
    <span
      style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 10,
        background: "oklch(68% .19 52/0.12)",
        border: "1px solid oklch(68% .19 52/.3)",
        color: "var(--amber)",
        padding: "3px 8px",
        borderRadius: 5,
        letterSpacing: ".08em",
      }}
    >
      TESTNET · SIMULATED
    </span>
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
              Yields
            </h1>
            <TestnetBadge />
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
            Simulated sBTC yield rates on Stacks testnet — for testing, not live mainnet data.
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
