import { useYields } from "../../hooks/useYields.js";
import { YieldRow } from "./YieldRow.js";
import { MarkSC } from "../shared/MarkSC.js";

export function YieldTable() {
  const { data, isLoading, isError } = useYields();

  if (isError) {
    return (
      <div
        style={{
          borderRadius: 13,
          border: "1px solid oklch(65% .19 22/.2)",
          background: "oklch(65% .19 22/.05)",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--red)", fontSize: 14 }}>
          Unable to load yield data. The indexer may be offline.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          padding: "70px 0",
          animation: "fadeIn .3s ease",
        }}
      >
        <MarkSC size={48} pulse />
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: "var(--muted)",
            letterSpacing: ".1em",
          }}
        >
          SCANNING PROTOCOLS…
        </div>
        <div
          style={{
            width: 220,
            height: 2,
            background: "var(--bg3)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              borderRadius: 2,
              backgroundImage:
                "linear-gradient(90deg,transparent 0%,var(--amber) 50%,transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.1s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p style={{ color: "var(--muted)", textAlign: "center", padding: "40px 0" }}>
        No yield data available right now.
      </p>
    );
  }

  const best = [...data].sort((a, b) => b.apy_percent - a.apy_percent);
  const allStale = best.every((y) => y.apy_stale);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {allStale && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid oklch(65% .19 22/.3)",
            background: "oklch(65% .19 22/.08)",
            padding: "12px 18px",
            fontSize: 13,
            color: "var(--red)",
          }}
        >
          APY data is stale across all protocols. Deposits are paused on-chain until oracles update.
        </div>
      )}
      {best.map((y, i) => (
        <YieldRow key={y.protocol} data={y} index={i} isBest={i === 0} />
      ))}
      {best.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "13px 20px",
            borderRadius: 10,
            background: "oklch(68% .19 52/0.05)",
            border: "1px solid oklch(68% .19 52/.12)",
            marginTop: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <MarkSC size={20} />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Best available:{" "}
              <strong style={{ color: "var(--amber)" }}>
                {best[0].apy_percent.toFixed(1)}% APY
              </strong>{" "}
              on {best[0].protocol.charAt(0).toUpperCase() + best[0].protocol.slice(1)}
            </span>
          </div>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "var(--lo)",
            }}
          >
            sBTC · non-custodial
          </span>
        </div>
      )}
    </div>
  );
}
