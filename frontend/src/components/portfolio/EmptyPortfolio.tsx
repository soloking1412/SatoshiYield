import { Link } from "react-router-dom";

export function EmptyPortfolio() {
  return (
    <div className="rounded-xl border border-surface-border p-12 flex flex-col items-center gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-surface-card flex items-center justify-center">
        <span className="text-2xl text-brand-orange">&#8383;</span>
      </div>
      <h2 className="text-lg font-semibold text-text-primary">
        No active position
      </h2>
      <p className="text-text-secondary text-sm max-w-xs">
        You don't have any sBTC deposited yet. Go to Yields to find the best
        rate and start earning.
      </p>
      <Link
        to="/"
        className="px-5 py-2.5 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim transition-colors"
      >
        View Yields
      </Link>
    </div>
  );
}
