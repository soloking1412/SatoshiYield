import { useEffect, type CSSProperties } from "react";
import {
  useWallet,
  isXverseInstalled,
  isLeatherInstalled,
  type WalletId,
} from "../../context/WalletContext.js";

interface WalletOption {
  id: WalletId;
  name: string;
  tagline: string;
  installed: boolean;
  installUrl: string;
  iconBg: string;
  iconColor: string;
  letter: string;
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "12px 14px",
  width: "100%",
};

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { isConnected, isConnecting, connect } = useWallet();

  // Close as soon as a wallet connects.
  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  const wallets: WalletOption[] = [
    {
      id: "xverse",
      name: "Xverse",
      tagline: "Bitcoin & Stacks wallet",
      installed: isXverseInstalled(),
      installUrl: "https://www.xverse.app/download",
      iconBg: "#181818",
      iconColor: "#ee7a30",
      letter: "X",
    },
    {
      id: "leather",
      name: "Leather",
      tagline: "Stacks & Bitcoin wallet",
      installed: isLeatherInstalled(),
      installUrl: "https://leather.io/install-extension",
      iconBg: "#c97539",
      iconColor: "#ffffff",
      letter: "L",
    },
  ];

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
          padding: "26px 24px",
          width: "100%",
          maxWidth: 380,
          animation: "modalUp .3s cubic-bezier(.34,1.56,.64,1) both",
          boxShadow: "var(--shadow)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Connect a wallet</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 17,
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          Choose a Stacks wallet to connect and deposit sBTC.
        </div>

        {isConnecting ? (
          <div style={{ textAlign: "center", padding: "26px 0" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  border: "3px solid var(--bg4)",
                  borderTopColor: "var(--amber)",
                  animation: "spin .8s linear infinite",
                }}
              />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Connecting…</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              Approve the request in your wallet
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {wallets.map((w) => (
              <WalletRow key={w.id} wallet={w} onConnect={() => void connect(w.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletRow({
  wallet,
  onConnect,
}: {
  wallet: WalletOption;
  onConnect: () => void;
}) {
  const icon = (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        flexShrink: 0,
        background: wallet.iconBg,
        color: wallet.iconColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: 18,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {wallet.letter}
    </div>
  );

  const label = (
    <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
        {wallet.name}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{wallet.tagline}</div>
    </div>
  );

  if (!wallet.installed) {
    return (
      <a
        href={wallet.installUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...rowStyle, textDecoration: "none", opacity: 0.85 }}
      >
        {icon}
        {label}
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--amber)",
            whiteSpace: "nowrap",
          }}
        >
          Install ↗
        </span>
      </a>
    );
  }

  return (
    <button
      onClick={onConnect}
      style={{ ...rowStyle, cursor: "pointer", transition: "border-color .15s" }}
    >
      {icon}
      {label}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M5 3l4 4-4 4"
          stroke="var(--muted)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
