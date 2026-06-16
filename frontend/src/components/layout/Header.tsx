import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../../context/WalletContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { useConnectModal } from "../../context/ConnectModalContext.js";
import { MarkSC } from "../shared/MarkSC.js";
import { GetSbtcButton } from "../wallet/GetSbtcButton.js";
import { FaucetButton } from "../wallet/FaucetButton.js";
import { networkName } from "../../lib/stacksClient.js";

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
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg3)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "background .15s, border-color .15s",
      }}
      onMouseOver={e => (e.currentTarget.style.background = "var(--bg4)")}
      onMouseOut={e => (e.currentTarget.style.background = "var(--bg3)")}
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
  const { address, isConnected, isConnecting, disconnect } = useWallet();
  const { openConnectModal } = useConnectModal();

  const tabs = [
    { label: "Home",      to: "/" },
    { label: "Yields",    to: "/yields" },
    { label: "TVL",       to: "/tvl" },
    { label: "Portfolio", to: "/portfolio" },
  ];

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--navBg)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 20px",
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 16,
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
            <span style={{ color: "var(--accent)" }}>Satoshi</span>
            <span style={{ color: "var(--text)" }}>Yield</span>
          </span>
        </Link>

        {/* Desktop nav tabs */}
        <div className="hidden sm:flex" style={{ gap: 2, marginLeft: 14 }}>
          {tabs.map(({ label, to }) => {
            const active = to === "/" ? pathname === "/" : pathname === to;
            return (
              <Link
                key={to}
                to={to}
                style={{
                  position: "relative",
                  background: "transparent",
                  color: active ? "var(--text)" : "var(--muted)",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  padding: "8px 14px",
                  borderRadius: "var(--r-sm)",
                  transition: "color .15s",
                  textDecoration: "none",
                  display: "inline-block",
                }}
                onMouseOver={e => { if (!active) e.currentTarget.style.color = "var(--text)"; }}
                onMouseOut={e => { if (!active) e.currentTarget.style.color = "var(--muted)"; }}
              >
                {label}
                {active && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: -9,
                      left: 14,
                      right: 14,
                      height: 2,
                      background: "var(--accent)",
                      borderRadius: 2,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <ThemeToggle />

        {/* Wallet area — desktop only */}
        <div className="hidden sm:flex" style={{ alignItems: "center", gap: 9 }}>
          {/* Onboarding: mainnet -> bridge link; testnet -> faucet (each self-gates) */}
          <GetSbtcButton />
          <FaucetButton />
          {isConnected && address ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-pill)",
                padding: "7px 14px 7px 11px",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--pos)", flexShrink: 0 }} />
              {networkName !== "mainnet" && (
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "var(--accent)", letterSpacing: ".06em" }}>
                  {networkName.toUpperCase()}
                </span>
              )}
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--text)" }}>
                {truncate(address)}
              </span>
              <button
                onClick={disconnect}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--lo)",
                  cursor: "pointer",
                  padding: "0 2px",
                  fontSize: 12,
                  lineHeight: 1,
                  transition: "color .15s",
                }}
                onMouseOver={e => (e.currentTarget.style.color = "var(--neg)")}
                onMouseOut={e => (e.currentTarget.style.color = "var(--lo)")}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={openConnectModal}
              disabled={isConnecting}
              style={{
                background: "var(--accent)",
                color: "var(--onAccent)",
                border: "none",
                borderRadius: "var(--r-pill)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 13.5,
                fontWeight: 700,
                padding: "9px 20px",
                cursor: isConnecting ? "default" : "pointer",
                whiteSpace: "nowrap",
                opacity: isConnecting ? 0.65 : 1,
                transition: "transform .12s, opacity .15s",
              }}
              onMouseOver={e => { if (!isConnecting) e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseOut={e => { e.currentTarget.style.transform = "none"; }}
            >
              {isConnecting ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>

        {/* Mobile connect button — only shown when not connected */}
        {!isConnected && (
          <button
            onClick={openConnectModal}
            className="sm:hidden"
            disabled={isConnecting}
            style={{
              background: "var(--accentD)",
              color: "var(--accent)",
              border: "1.5px solid color-mix(in oklch, var(--accent) 35%, transparent)",
              borderRadius: "var(--r-pill)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 14px",
              cursor: isConnecting ? "default" : "pointer",
              whiteSpace: "nowrap",
              opacity: isConnecting ? 0.65 : 1,
            }}
          >
            {isConnecting ? "…" : "Connect"}
          </button>
        )}
      </div>
    </nav>
  );
}
