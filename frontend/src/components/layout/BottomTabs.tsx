import { Link, useLocation } from "react-router-dom";

const tabs = [
  {
    label: "Home",
    to: "/",
    icon: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9Z" />,
  },
  {
    label: "Yields",
    to: "/yields",
    icon: <path d="M4 16l5-5 4 3 6-8" />,
  },
  {
    label: "TVL",
    to: "/tvl",
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    label: "Portfolio",
    to: "/portfolio",
    icon: (
      <g>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      </g>
    ),
  },
];

export function BottomTabs() {
  const { pathname } = useLocation();

  return (
    <div
      className="sm:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        background: "var(--navBg)",
        borderTop: "1px solid var(--border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        display: "flex",
      }}
    >
      {tabs.map(({ label, to, icon }) => {
        const active = to === "/" ? pathname === "/" : pathname === to;
        return (
          <Link
            key={to}
            to={to}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "10px 0 12px",
              textDecoration: "none",
              position: "relative",
            }}
          >
            {/* Active top bar */}
            {active && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "25%",
                  right: "25%",
                  height: 2,
                  borderRadius: "0 0 2px 2px",
                  background: "var(--accent)",
                  animation: "fadeIn .2s ease",
                }}
              />
            )}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={active ? "var(--accent)" : "var(--muted)"}
              strokeWidth={active ? "2.2" : "1.9"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icon}
            </svg>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: active ? 700 : 500,
                letterSpacing: ".01em",
                fontFamily: "'Space Grotesk', sans-serif",
                color: active ? "var(--accent)" : "var(--muted)",
                transition: "color .15s",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
