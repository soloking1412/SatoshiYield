import { MarkSC } from "../shared/MarkSC.js";

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        marginTop: "auto",
        flexWrap: "wrap",
        gap: 12,
        transition: "border-color .25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MarkSC size={15} />
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: "var(--lo)",
          }}
        >
          SatoshiYields -- non-custodial sBTC yield on Stacks
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 18 }}>
        {[
          { label: "GitHub", href: "https://github.com/soloking1412/SatoshiYield" },
          { label: "Stacks Docs", href: "https://docs.stacks.co" },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              color: "var(--lo)",
              textDecoration: "none",
              transition: "color .15s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "var(--muted)")}
            onMouseOut={(e) => (e.currentTarget.style.color = "var(--lo)")}
          >
            {label}
          </a>
        ))}
      </div>
    </footer>
  );
}
