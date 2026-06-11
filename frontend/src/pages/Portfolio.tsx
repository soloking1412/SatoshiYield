import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext.js";
import { usePositions } from "../hooks/usePositions.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { PositionCard } from "../components/portfolio/PositionCard.js";
import { EmptyPortfolio } from "../components/portfolio/EmptyPortfolio.js";
import { MarkSC } from "../components/shared/MarkSC.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { PROTOCOLS } from "../constants/protocols.js";

export function Portfolio() {
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  const { data: position, isLoading } = usePositions();
  const { openConnectModal } = useConnectModal();

  // Animate the balance display
  const balanceSats = position ? Number(position.principalSats) / 1e8 : 0;
  const balVal = useCountUp(balanceSats, 1000, 200);

  if (!isConnected) {
    return (
      <main
        className="pb-20 sm:pb-10"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <MarkSC size={52} pulse />
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 12,
          }}
        >
          Your portfolio
        </h1>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 380,
            margin: "0 auto 30px",
          }}
        >
          Connect your wallet to see your deposits, earnings, and APY — all in one place.
        </p>
        <button
          onClick={openConnectModal}
          style={{
            background: "var(--accent)",
            color: "var(--onAccent)",
            border: "none",
            borderRadius: "var(--r)",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 15,
            fontWeight: 700,
            padding: "14px 30px",
            cursor: "pointer",
            transition: "transform .12s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "none")}
        >
          Connect wallet
        </button>
      </main>
    );
  }

  return (
    <main
      className="pb-20 sm:pb-10"
      style={{ maxWidth: 760, margin: "0 auto", padding: "44px 24px" }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 6,
            margin: 0,
          }}
        >
          Your portfolio
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          Everything you're earning, in one view.
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
            animation: "fadeIn .3s ease",
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
        <>
          {/* ── Balance hero ────────────── */}
          <div
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              padding: "30px 28px",
              marginBottom: 16,
              boxShadow: "0 0 50px -18px var(--glow)",
            }}
          >
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "var(--lo)",
                letterSpacing: ".12em",
                marginBottom: 10,
              }}
            >
              TOTAL BALANCE
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: "clamp(36px,6vw,46px)",
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {balVal.toFixed(4)}
              </div>
              <span style={{ fontSize: 20, color: "var(--accent)", fontWeight: 600 }}>sBTC</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--accent2D)",
                  border:
                    "1px solid color-mix(in oklch, var(--accent2) 30%, transparent)",
                  borderRadius: "var(--r-pill)",
                  padding: "5px 13px",
                }}
              >
                <span style={{ color: "var(--pos)", fontSize: 13 }}>●</span>
                <span
                  style={{ fontSize: 12.5, color: "var(--pos)", fontWeight: 600 }}
                >
                  {PROTOCOLS[position.protocol].name}
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                  padding: "5px 13px",
                  fontSize: 12.5,
                  color: "var(--muted)",
                }}
              >
                principal-protected beta
              </div>
            </div>
          </div>

          {/* ── Active position card ─────── */}
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "var(--lo)",
              letterSpacing: ".12em",
              margin: "4px 2px 12px",
            }}
          >
            ACTIVE POSITION
          </div>

          <PositionCard position={position} />

          <div
            style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}
          >
            <button
              onClick={() => navigate("/yields")}
              style={{
                flex: 1,
                minWidth: 140,
                background: "transparent",
                color: "var(--accent)",
                border: "1.5px solid var(--accent)",
                borderRadius: "var(--r)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                padding: "13px 20px",
                cursor: "pointer",
                transition: "background .15s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "var(--accentD)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              + New deposit
            </button>
          </div>
        </>
      ) : (
        <EmptyPortfolio />
      )}
    </main>
  );
}
