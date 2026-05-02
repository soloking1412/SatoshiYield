import { useWallet } from "../context/WalletContext.js";
import { usePositions } from "../hooks/usePositions.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { PositionCard } from "../components/portfolio/PositionCard.js";
import { EmptyPortfolio } from "../components/portfolio/EmptyPortfolio.js";
import { MarkSC } from "../components/shared/MarkSC.js";

export function Portfolio() {
  const { isConnected } = useWallet();
  const { data: position, isLoading } = usePositions();
  const { openConnectModal } = useConnectModal();

  if (!isConnected) {
    return (
      <main
        className="pb-20 sm:pb-10"
      style={{ maxWidth: 900, margin: "0 auto", paddingTop: 44, paddingLeft: 24, paddingRight: 24 }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 6,
          }}
        >
          Portfolio
        </h1>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <MarkSC size={56} pulse />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            No wallet connected
          </div>
          <div
            style={{
              color: "var(--muted)",
              fontSize: 14,
              lineHeight: 1.7,
              maxWidth: 340,
              marginBottom: 28,
            }}
          >
            Connect your Stacks wallet to view your sBTC positions and start earning yield.
          </div>
          <button
            onClick={openConnectModal}
            style={{
              background: "var(--amber)",
              color: "#000",
              border: "none",
              borderRadius: 10,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              padding: "14px 32px",
              cursor: "pointer",
              transition: "opacity .15s",
            }}
          >
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="pb-20 sm:pb-10"
      style={{ maxWidth: 900, margin: "0 auto", paddingTop: 44, paddingLeft: 24, paddingRight: 24 }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 4,
          }}
        >
          Portfolio
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
          Your active sBTC positions on Stacks.
        </p>
      </div>

      {isLoading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            padding: "70px 0",
          }}
        >
          <MarkSC size={48} pulse />
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 12,
              color: "var(--muted)",
              letterSpacing: ".1em",
            }}
          >
            LOADING POSITION…
          </div>
        </div>
      ) : position ? (
        <PositionCard position={position} />
      ) : (
        <EmptyPortfolio />
      )}
    </main>
  );
}
