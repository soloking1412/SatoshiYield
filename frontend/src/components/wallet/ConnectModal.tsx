import { useEffect } from "react";
import { useWallet } from "../../context/WalletContext.js";
import { MarkSC } from "../shared/MarkSC.js";

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
  width: "100%",
  marginBottom: 12,
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
  width: "100%",
};

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { isConnected, isConnecting, connect } = useWallet();

  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  const handleConnect = () => {
    void connect();
  };

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
          padding: "32px 24px",
          width: "100%",
          maxWidth: 380,
          animation: "modalUp .3s cubic-bezier(.34,1.56,.64,1) both",
          boxShadow: "var(--shadow)",
          textAlign: "center",
        }}
      >
        {isConnecting ? (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  border: "3px solid var(--bg4)",
                  borderTopColor: "var(--amber)",
                  animation: "spin .8s linear infinite",
                }}
              />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              Connecting wallet…
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Approve in your Stacks wallet
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <MarkSC size={52} pulse />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Connect Wallet
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--muted)",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              Connect your Stacks wallet to deposit sBTC and earn yield.
            </div>
            <button onClick={handleConnect} style={fillBtn}>
              Connect Wallet
            </button>
            <button onClick={onClose} style={ghostBtn}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
