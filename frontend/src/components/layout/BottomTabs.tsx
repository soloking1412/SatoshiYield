import { Link, useLocation } from "react-router-dom";

const tabs = [
  { label: "Yields", to: "/", icon: "◈" },
  { label: "Portfolio", to: "/portfolio", icon: "◉" },
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
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
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
              padding: "12px 0",
              border: "none",
              background: "transparent",
              color: active ? "var(--amber)" : "var(--lo)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              transition: "color .15s",
              textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
