import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "../wallet/ConnectButton.js";
import { FaucetButton } from "../wallet/FaucetButton.js";
import { clsx } from "clsx";

export function Header() {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-surface-base/90 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-brand-orange font-bold text-lg tracking-tight">
              SatoshiYield
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            <NavLink to="/" active={pathname === "/"}>
              Yields
            </NavLink>
            <NavLink to="/portfolio" active={pathname === "/portfolio"}>
              Portfolio
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <NetworkBadge />
          <FaucetButton />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={clsx(
        "px-3 py-1.5 rounded-md text-sm transition-colors",
        active
          ? "bg-surface-card text-text-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
      )}
    >
      {children}
    </Link>
  );
}

function NetworkBadge() {
  const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";
  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded text-xs font-mono",
        isMainnet
          ? "bg-yield-green/10 text-yield-green"
          : "bg-amber-500/10 text-amber-400"
      )}
    >
      {isMainnet ? "mainnet" : "testnet"}
    </span>
  );
}
