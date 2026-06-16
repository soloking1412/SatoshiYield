import { useRef, useEffect, useState, useMemo } from "react";
import { useYields } from "../hooks/useYields.js";
import { useVaultStats } from "../hooks/useVaultStats.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { MarkSC } from "../components/shared/MarkSC.js";
import { PROTOCOLS } from "../constants/protocols.js";
import { CONTRACTS } from "../constants/contracts.js";

/* ── helpers ──────────────────────────────────────────── */

function satsToBtc(sats: number, decimals = 4): string {
  return (sats / 1e8).toFixed(decimals);
}

function formatTvl(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return usd > 0 ? `$${usd.toFixed(0)}` : "—";
}

function explorerUrl(contract: string): string {
  return `https://explorer.hiro.so/address/${contract}?chain=mainnet`;
}

/* ── TVL chart (animated area + stroke) ──────────────── */

function makeTvlHistory(current: number, days: number): number[] {
  const seed = current > 0 ? current : 100_000; // fallback for 0 TVL
  const out: number[] = [];
  let v = seed * 0.68;
  for (let i = 0; i < days; i++) {
    const pull = ((seed - v) / Math.max(days - i, 1)) * 1.1;
    const wave = Math.sin(i / 7) * seed * 0.014;
    const noise = (Math.random() - 0.45) * seed * 0.009;
    v = Math.max(seed * 0.5, v + pull + wave + noise);
    out.push(Math.round(v));
  }
  out[out.length - 1] = current > 0 ? current : seed;
  return out;
}

function TVLChart({ data }: { data: number[] }) {
  const W = 820, H = 240;
  const pad = { t: 18, r: 8, b: 26, l: 8 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const mn = Math.min(...data) * 0.92, mx = Math.max(...data) * 1.04;
  const X = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const Y = (v: number) => pad.t + (1 - (v - mn) / (mx - mn)) * ih;
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${X(data.length - 1).toFixed(1)} ${pad.t + ih} L ${X(0).toFixed(1)} ${pad.t + ih} Z`;
  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, [data]);
  const ex = X(data.length - 1), ey = Y(data[data.length - 1]);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="tvlg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(g => (
        <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + g * ih} y2={pad.t + g * ih}
          stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" opacity="0.5"/>
      ))}
      <path d={area} fill="url(#tvlg)" style={{ animation: "fadeIn 1.2s .3s both" }}/>
      <path ref={pathRef} d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={len ? ({ strokeDasharray: len, strokeDashoffset: len, animation: "drawLine 1.6s cubic-bezier(.6,.05,.2,1) forwards" } as React.CSSProperties) : {}}/>
      <circle cx={ex} cy={ey} r="4.5" fill="var(--accent)" style={{ animation: "fadeIn .4s 1.5s both" }}/>
      <circle cx={ex} cy={ey} r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4" style={{ animation: "fadeIn .4s 1.5s both" }}/>
    </svg>
  );
}

/* ── stat row ──────────────────────────────────────────── */

function StatRow({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: muted ? "var(--muted)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────── */

export function TVL() {
  const { data: yields, isLoading: yieldsLoading } = useYields();
  const { data: vault, isLoading: vaultLoading } = useVaultStats();
  const [range, setRange] = useState<"7D" | "30D" | "90D">("90D");
  const ranges = { "7D": 7, "30D": 30, "90D": 90 } as const;

  // On-chain total (sats) takes priority over indexer sum when available
  const onChainSats = vault?.totalDepositedSats ?? 0;
  const indexerTvlUsd = (yields ?? []).reduce((s, y) => s + y.tvl_usd, 0);

  const history = useMemo(
    () => makeTvlHistory(onChainSats > 0 ? onChainSats : Math.max(indexerTvlUsd * 15, 1), 90),
    [onChainSats, indexerTvlUsd]
  );
  const slice = history.slice(-ranges[range]);

  const tvlSatsAnimated = useCountUp(onChainSats, 1100, 150);
  const tvlUsdAnimated = useCountUp(indexerTvlUsd, 1100, 150);

  const sorted = [...(yields ?? [])].sort((a, b) => b.tvl_usd - a.tvl_usd);
  const maxTvl = Math.max(...(yields ?? []).map(y => y.tvl_usd), 1);

  const feePct = vault ? (vault.feeBasisPoints / 100).toFixed(0) : "5";
  const tvlCapBtc = vault ? satsToBtc(vault.tvlCapSats) : "0.5";
  const minDepSats = vault?.minDepositSats ?? 1_000;
  const feeBalBtc = vault ? satsToBtc(vault.feeBalanceSats, 6) : "—";
  const isLoading = yieldsLoading || vaultLoading;

  return (
    <div className="pb-20 sm:pb-10" style={{ maxWidth: 920, margin: "0 auto", padding: "44px 24px" }}>

      {/* header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>Total Value Locked</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--pos)", animation: "pulseDot 1.8s ease-in-out infinite" }}/>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--muted)", letterSpacing: ".05em" }}>LIVE</span>
          </div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 560, margin: 0 }}>
          Live total value locked in Zest Earn — the Stacks lending protocol SatoshiYield
          routes your sBTC into. Your deposits are held non-custodially in{" "}
          <a href={explorerUrl(CONTRACTS.VAULT)} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "none" }}>
            {CONTRACTS.VAULT.slice(0, 8)}…vault-v6 ↗
          </a>.
        </p>
      </div>

      {/* hero chart card */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", boxShadow: "0 0 50px -16px var(--glow)", marginBottom: 24 }}>
        <div style={{ padding: "28px 28px 10px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)", letterSpacing: ".12em", marginBottom: 8 }}>ZEST EARN · PROTOCOL TVL</div>
            {isLoading ? (
              <div style={{ fontSize: 48, fontWeight: 700, color: "var(--muted)", letterSpacing: "-0.04em", lineHeight: 1 }}>—</div>
            ) : (
              <>
                <div style={{ fontSize: "clamp(32px,6vw,52px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {indexerTvlUsd > 0 ? formatTvl(tvlUsdAnimated) : "—"}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9.5, color: "var(--lo)", letterSpacing: ".08em" }}>VIA SATOSHIYIELD</span>
                  <span style={{ color: "var(--text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {satsToBtc(tvlSatsAnimated, 4)} sBTC
                  </span>
                  {onChainSats === 0 && <span style={{ color: "var(--lo)" }}>· no deposits yet</span>}
                </div>
              </>
            )}
          </div>
          {/* range toggle */}
          <div style={{ display: "flex", gap: 4, background: "var(--bg3)", borderRadius: "var(--r-sm)", padding: 4, border: "1px solid var(--border)" }}>
            {(["7D", "30D", "90D"] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                style={{ background: range === r ? "var(--accent)" : "transparent", color: range === r ? "var(--onAccent)" : "var(--muted)", border: "none", borderRadius: "calc(var(--r-sm) - 2px)", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", padding: "6px 12px", cursor: "pointer", transition: "all .15s" }}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "4px 12px 14px" }}>
          {onChainSats > 0 && slice.length > 0 ? (
            <TVLChart key={range} data={slice} />
          ) : (
            <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.45 }}>
              <MarkSC size={36} />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "var(--muted)", letterSpacing: ".1em" }}>
                NO DEPOSITS YET
              </span>
            </div>
          )}
        </div>
        <div style={{ padding: "10px 28px 16px", display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)", letterSpacing: ".06em" }}>
            Chart tracks SatoshiYield vault deposits — a simulated trend to the live on-chain total until historical snapshots land in v2.
          </span>
        </div>
      </div>

      {/* vault stats + contract */}
      <div className="grid sm:grid-cols-2" style={{ gap: 16, marginBottom: 32 }}>

        {/* Vault parameters (live from chain) */}
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "22px 24px" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)", letterSpacing: ".12em", marginBottom: 14 }}>VAULT PARAMETERS</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <StatRow label="Contract" value={
              <a href={explorerUrl(CONTRACTS.VAULT)} target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--accent)", fontFamily: "'Space Mono', monospace", fontSize: 11, textDecoration: "none" }}>
                vault-v6 ↗
              </a>
            }/>
            <StatRow label="Network" value={<span style={{ color: "var(--pos)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>STACKS MAINNET</span>}/>
            <StatRow label="Protocol fee" value={`${feePct}% on yield only`}/>
            <StatRow label="Fee on principal" value={<span style={{ color: "var(--pos)" }}>0% — never</span>}/>
            <StatRow label="TVL cap (beta)" value={`${tvlCapBtc} sBTC`}/>
            <StatRow label="Min deposit" value={`${minDepSats.toLocaleString()} sats`}/>
            <StatRow label="Timelock (fee changes)" value="144 blocks (~24 hr)" muted/>
            <StatRow label="Fee balance (uncollected)" value={`${feeBalBtc} sBTC`} muted/>
          </div>
        </div>

        {/* sBTC token */}
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "22px 24px" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)", letterSpacing: ".12em", marginBottom: 14 }}>ADAPTERS ON-CHAIN</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {Object.entries(CONTRACTS.ADAPTERS).map(([id, addr]) => {
              const meta = PROTOCOLS[id as keyof typeof PROTOCOLS];
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: meta?.color ?? "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>{meta?.abbr ?? id.slice(0,2).toUpperCase()}</div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{meta?.name ?? id}</span>
                  </div>
                  <a href={explorerUrl(addr)} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--accent)", textDecoration: "none", letterSpacing: ".02em" }}>
                    {addr.split(".")[1]} ↗
                  </a>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--bg3)", borderRadius: "var(--r-sm)", display: "flex", alignItems: "flex-start", gap: 8 }}>
            <MarkSC size={16} />
            <span style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              All adapters are deployed on Stacks mainnet and approved by vault-v6.
              Funds move only when you sign a transaction.
            </span>
          </div>
        </div>
      </div>

      {/* by protocol */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>TVL by protocol</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>From the SatoshiYield indexer — updated every 5 minutes.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {yieldsLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 66, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r)", opacity: 0.4 }}/>
            ))
          : sorted.map((y, i) => {
              const meta = PROTOCOLS[y.protocol];
              return (
                <div key={y.protocol} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 18px" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: meta.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>{meta.abbr}</div>
                  <div style={{ minWidth: 90 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{meta.name}</div>
                    <div style={{ fontSize: 11, color: "var(--pos)", marginTop: 2 }}>{y.apy_percent.toFixed(1)}% APY</div>
                  </div>
                  <div style={{ flex: 1, height: 10, background: "var(--bg3)", borderRadius: "var(--r-pill)", overflow: "hidden", minWidth: 60 }}>
                    <div style={{ height: "100%", width: `${(y.tvl_usd / maxTvl) * 100}%`, background: "linear-gradient(90deg, var(--accentB), var(--accent))", borderRadius: "var(--r-pill)", transformOrigin: "left", animation: `growBar .9s ${i * 0.1}s cubic-bezier(.6,.05,.2,1) both` }}/>
                  </div>
                  <div style={{ minWidth: 80, textAlign: "right" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{formatTvl(y.tvl_usd)}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "var(--muted)", marginTop: 2, letterSpacing: ".05em" }}>
                      {indexerTvlUsd > 0 ? `${((y.tvl_usd / indexerTvlUsd) * 100).toFixed(0)}% of total` : "—"}
                    </div>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* fee model explainer */}
      <div style={{ marginTop: 24, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "22px 24px" }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)", letterSpacing: ".12em", marginBottom: 14 }}>HOW THE FEE WORKS</div>
        <div className="grid sm:grid-cols-3" style={{ gap: 16 }}>
          {[
            { label: "On yield",     val: `${feePct}%`,  col: "var(--pos)",   desc: `SatoshiYield takes ${feePct}% of the yield your sBTC earns. If you earn 0 yield, you pay 0 fee.` },
            { label: "On principal", val: "0%",           col: "var(--pos)",   desc: "Your deposited sBTC is never touched. The fee only applies to profit above your principal." },
            { label: "Fee timelock", val: "24 hr",        col: "var(--muted)", desc: "Any fee change requires a 144-block on-chain timelock. No surprise fee hikes." },
          ].map(({ label, val, col, desc }) => (
            <div key={label} style={{ padding: "4px 0" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)", letterSpacing: ".1em", marginBottom: 6 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: col, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 8 }}>{val}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* non-custodial note */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 16, padding: "13px 18px", borderRadius: "var(--r)", background: "var(--bg2)", border: "1px solid var(--border)" }}>
        <MarkSC size={18} />
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Funds are always non-custodial — held in vault-v6 on Stacks mainnet, never by SatoshiYield.{" "}
          <a href={explorerUrl(CONTRACTS.VAULT)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Verify on-chain ↗
          </a>
        </span>
      </div>

    </div>
  );
}
