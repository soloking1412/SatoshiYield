import { useWallet } from "../../context/WalletContext.js";

function truncate(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected, connect, disconnect } = useWallet();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-text-secondary">
          {truncate(address)}
        </span>
        <button
          onClick={disconnect}
          className="px-4 py-2 text-sm rounded-lg border border-surface-border text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => void connect()}
      className="px-5 py-2.5 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim active:scale-95 transition-all"
    >
      Connect Wallet
    </button>
  );
}
