import { useWallet } from "../context/WalletContext.js";
import { usePositions } from "../hooks/usePositions.js";
import { PositionCard } from "../components/portfolio/PositionCard.js";
import { EmptyPortfolio } from "../components/portfolio/EmptyPortfolio.js";

export function Portfolio() {
  const { isConnected, connect } = useWallet();
  const { data: position, isLoading } = usePositions();

  if (!isConnected) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Portfolio</h1>
        <p className="text-text-secondary text-sm">
          Connect your wallet to view your positions.
        </p>
        <button
          onClick={() => void connect()}
          className="px-5 py-2.5 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim transition-colors"
        >
          Connect Wallet
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-text-primary">Portfolio</h1>

      {isLoading ? (
        <div className="bg-surface-card rounded-xl p-10 flex justify-center">
          <span className="text-text-secondary text-sm animate-pulse">
            Loading position...
          </span>
        </div>
      ) : position ? (
        <PositionCard position={position} />
      ) : (
        <EmptyPortfolio />
      )}
    </main>
  );
}
