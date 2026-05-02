import { Link } from "react-router-dom";
import { MarkSC } from "../shared/MarkSC.js";

export function EmptyPortfolio() {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid var(--border)",
        padding: "64px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      <MarkSC size={52} pulse />
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>No active position</h2>
      <p
        style={{
          color: "var(--muted)",
          fontSize: 14,
          lineHeight: 1.7,
          maxWidth: 320,
          margin: 0,
        }}
      >
        You don't have any sBTC deposited yet. Go to Yields to find the best rate and start
        earning.
      </p>
      <Link
        to="/"
        style={{
          background: "var(--amber)",
          color: "#000",
          border: "none",
          borderRadius: 10,
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 14,
          fontWeight: 700,
          padding: "13px 28px",
          cursor: "pointer",
          textDecoration: "none",
          display: "inline-block",
          marginTop: 8,
        }}
      >
        View Yields
      </Link>
    </div>
  );
}
