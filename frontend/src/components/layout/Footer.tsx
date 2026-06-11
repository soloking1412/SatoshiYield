import { Link } from "react-router-dom";
import { MarkSC } from "../shared/MarkSC.js";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--bg2)" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "40px 24px",
          display: "flex",
          gap: 28,
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        {/* Brand */}
        <div style={{ maxWidth: 280 }}>
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              userSelect: "none",
            }}
          >
            <MarkSC size={24} />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.03em" }}>
              <span style={{ color: "var(--accent)" }}>Satoshi</span>
              <span style={{ color: "var(--text)" }}>Yield</span>
            </span>
          </Link>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.6,
              marginTop: 14,
            }}
          >
            The simplest way to earn yield on your Bitcoin. Non-custodial, built on Stacks.
          </p>
        </div>

        {/* Links */}
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                letterSpacing: ".1em",
                color: "var(--lo)",
                marginBottom: 3,
              }}
            >
              PRODUCT
            </div>
            {(
              [
                ["Yields", "/yields"],
                ["TVL", "/tvl"],
                ["Portfolio", "/portfolio"],
              ] as const
            ).map(([label, to]) => (
              <Link
                key={to}
                to={to}
                style={{
                  fontSize: 13.5,
                  color: "var(--muted)",
                  textDecoration: "none",
                  transition: "color .15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--text)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--muted)")}
              >
                {label}
              </Link>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                letterSpacing: ".1em",
                color: "var(--lo)",
                marginBottom: 3,
              }}
            >
              RESOURCES
            </div>
            {[
              { label: "GitHub", href: "https://github.com/soloking1412/SatoshiYield" },
              { label: "Stacks Docs", href: "https://docs.stacks.co" },
              { label: "Discord", href: "#" },
              { label: "Audits", href: "#" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                style={{
                  fontSize: 13.5,
                  color: "var(--muted)",
                  textDecoration: "none",
                  transition: "color .15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--text)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--muted)")}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "var(--lo)",
            }}
          >
            © 2026 SatoshiYield
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "var(--lo)",
            }}
          >
            Non-custodial · Built on Stacks
          </span>
        </div>
      </div>
    </footer>
  );
}
