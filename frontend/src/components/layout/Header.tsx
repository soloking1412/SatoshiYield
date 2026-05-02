import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../../context/WalletContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { useConnectModal } from "../../context/ConnectModalContext.js";
import { MarkSC } from "../shared/MarkSC.js";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        width: 36,
        height: 36,
        borderRadius: 9,
        border: "1px solid var(--border)",
        background: "var(--bg3)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "background .15s, border .15s",
      }}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3.5" stroke="var(--muted)" strokeWidth="1.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (Math.PI * a) / 180;
            return (
              <line
                key={a}
                x1={(8 + 5.5 * Math.cos(r)).toFixed(1)}
                y1={(8 + 5.5 * Math.sin(r)).toFixed(1)}
                x2={(8 + 7 * Math.cos(r)).toFixed(1)}
                y2={(8 + 7 * Math.sin(r)).toFixed(1)}
                stroke="var(--muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M13.5 8.5A5.5 5.5 0 0 1 7 3a5.5 5.5 0 1 0 6.5 5.5Z"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const { address, isConnected, disconnect } = useWallet();
  const { openConnectModal } = useConnectModal();

  const tabs = [
    { label: "Yields", to: "/" },
    { label: "Portfolio", to: "/portfolio" },
  ];

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        height: 56,
        gap: 16,
        background: "var(--navBg)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        transition: "background .25s",
      }}
    >
      {/* Logo */}
      <Link
        to="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          userSelect: "none",
          flexShrink: 0,
          textDecoration: "none",
        }}
      >
        <MarkSC size={28} pulse />
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>
          <span style={{ color: "var(--amber)" }}>Satoshi</span>
          <span style={{ color: "var(--text)" }}>Yields</span>
        </span>
      </Link>

      {/* Desktop tabs */}
      <div className="hidden sm:flex" style={{ gap: 4 }}>
        {tabs.map(({ label, to }) => {
          const active = to === "/" ? pathname === "/" : pathname === to;
          return (
            <Link
              key={to}
              to={to}
              style={{
                background: active ? "var(--bg3)" : "transparent",
                border: "none",
                borderRadius: 8,
                color: active ? "var(--text)" : "var(--muted)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                padding: "6px 14px",
                cursor: "pointer",
                transition: "all .15s",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <ThemeToggle />

      {/* Wallet area — desktop only */}
      <div className="hidden sm:flex" style={{ alignItems: "center", gap: 8 }}>
        {isConnected && address ? (
          <>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                background: "oklch(68% .19 52/0.12)",
                border: "1px solid oklch(68% .19 52/.3)",
                color: "var(--amber)",
                padding: "3px 8px",
                borderRadius: 5,
                letterSpacing: ".06em",
              }}
            >
              testnet
            </span>
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
          </>
        ) : (
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
        )}
      </div>
    </nav>
  );
}
