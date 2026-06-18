import { useQueryClient } from "@tanstack/react-query";
import { useYields } from "../../hooks/useYields.js";
import { YieldRow } from "./YieldRow.js";
import { MarkSC } from "../shared/MarkSC.js";
import { PROTOCOLS, COMING_SOON } from "../../constants/protocols.js";
import { formatApy } from "../../lib/format.js";

export function YieldTable() {
  const { data, isLoading, isError } = useYields();
  const queryClient = useQueryClient();

  if (isError) {
    return (
      <div
        style={{
          borderRadius: "var(--r-lg)",
          border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)",
          background: "color-mix(in oklch, var(--neg) 8%, transparent)",
          padding: "32px 24px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="var(--neg)" strokeWidth="1.5"/>
          <path d="M12 8v4M12 16h.01" stroke="var(--neg)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <div>
          <p style={{ color: "var(--neg)", fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
            Indexer unreachable
          </p>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
            The yield data API may be offline or starting up. Try again in a moment.
          </p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["yields"] })}
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            color: "var(--text)",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            padding: "9px 20px",
            cursor: "pointer",
            transition: "background .15s",
          }}
          onMouseOver={e => (e.currentTarget.style.background = "var(--bg4)")}
          onMouseOut={e => (e.currentTarget.style.background = "var(--bg3)")}
        >
          ↻ Retry
        </button>
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
          FINDING THE BEST RATES…
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
                "linear-gradient(90deg,transparent 0%,var(--accent) 50%,transparent 100%)",
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

  // Both tiles are live; sort by APY descending.
  const best = [...data].sort((a, b) => b.apy_percent - a.apy_percent);
  const allStale = best.every((y) => y.apy_stale);
  const top = best[0]!;
  const topMeta = PROTOCOLS[top.protocol];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {allStale && (
        <div
          style={{
            borderRadius: "var(--r)",
            border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)",
            background: "color-mix(in oklch, var(--neg) 8%, transparent)",
            padding: "12px 18px",
            fontSize: 13,
            color: "var(--neg)",
          }}
        >
          APY data is stale across all protocols. Deposits are paused on-chain until oracles update.
        </div>
      )}

      {/* Recommended banner */}
      {!allStale && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            background: "var(--accentD)",
            border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)",
            borderRadius: "var(--r)",
            padding: "14px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MarkSC size={22} />
            <span style={{ fontSize: 13.5, color: "var(--text)" }}>
              <strong style={{ color: "var(--accent)" }}>Earning real yield now:</strong>{" "}
              <strong>{topMeta.name}</strong> — {topMeta.kind === "lending" ? "sBTC lending, principal-protected" : "managed Bitcoin strategy"}.
            </span>
          </div>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--pos)",
              whiteSpace: "nowrap",
            }}
          >
            {formatApy(top.apy_percent)}% APY
          </span>
        </div>
      )}

      {best.map((y, i) => (
        <YieldRow key={y.protocol} data={y} index={i} isBest={i === 0} />
      ))}

      {/* More yields coming soon */}
      {COMING_SOON.map((cs) => (
        <div
          key={cs.name}
          title={cs.blurb}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            borderRadius: "var(--r)",
            background: "var(--bg2)",
            border: "1px dashed var(--border)",
            opacity: 0.75,
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: cs.color,
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>
            {cs.abbr}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{cs.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{cs.blurb}</div>
          </div>
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
            letterSpacing: ".1em", color: "var(--muted)",
            border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px",
            whiteSpace: "nowrap",
          }}>
            COMING SOON
          </span>
        </div>
      ))}

      {best.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "13px 20px",
            borderRadius: "var(--r)",
            background: "var(--accentD)",
            border: "1px solid color-mix(in oklch, var(--accent) 12%, transparent)",
            marginTop: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <MarkSC size={20} />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Funds are always non-custodial — locked in audited protocol contracts.
            </span>
          </div>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "var(--lo)",
              whiteSpace: "nowrap",
            }}
          >
            sBTC · non-custodial
          </span>
        </div>
      )}
    </div>
  );
}
