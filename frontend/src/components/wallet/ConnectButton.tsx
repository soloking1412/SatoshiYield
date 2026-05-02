import { useWallet } from "../../context/WalletContext.js";
import { useConnectModal } from "../../context/ConnectModalContext.js";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected, disconnect } = useWallet();
  const { openConnectModal } = useConnectModal();

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          {truncate(address)}
        </span>
        <button
          onClick={disconnect}
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--muted)",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 12,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={openConnectModal}
      style={{
        background: "var(--amber)",
        color: "#000",
        border: "none",
        borderRadius: 10,
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        padding: "8px 16px",
        cursor: "pointer",
        transition: "opacity .15s",
      }}
    >
      Connect Wallet
    </button>
  );
}
