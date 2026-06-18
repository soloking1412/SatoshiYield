import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { useYields } from "../hooks/useYields.js";
import { useVaultStats } from "../hooks/useVaultStats.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { MarkSC } from "../components/shared/MarkSC.js";
import { formatApy } from "../lib/format.js";
import { PROTOCOLS } from "../constants/protocols.js";
import type { RiskLevel } from "../types/yield.js";

/* ── helpers ──────────────────────────────────────────── */

function satsToBtc(sats: number): string {
  return (sats / 1e8).toFixed(4);
}

function formatTvl(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return usd > 0 ? `$${usd}` : "—";
}

/* ── atoms ────────────────────────────────────────────── */

function HeroGlow() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", top: "-12%", right: "-6%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle,var(--glow),transparent 68%)", filter: "blur(20px)" }} />
      <div style={{ position: "absolute", bottom: "-18%", left: "-10%", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle,var(--accent2D),transparent 70%)", filter: "blur(24px)", opacity: 0.7 }} />
    </div>
  );
}

function LiveDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--pos)", flexShrink: 0, animation: "pulseDot 1.8s ease-in-out infinite" }} />
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--muted)", letterSpacing: ".05em" }}>LIVE</span>
    </div>
  );
}

function BetaBadge() {
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: ".08em", background: "var(--accentD)", color: "var(--accent)", border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)", padding: "2px 8px", borderRadius: "var(--r-sm)" }}>
      MAINNET BETA
    </span>
  );
}

function RiskPill({ level }: { level: RiskLevel }) {
  const cfg: Record<RiskLevel, { bg: string; color: string; label: string }> = {
    low:    { bg: "var(--accent2D)", color: "var(--accent2)", label: "Low risk" },
    medium: { bg: "color-mix(in oklch, var(--warn) 14%, transparent)", color: "var(--warn)", label: "Med risk" },
    high:   { bg: "oklch(72% .18 22/.14)", color: "var(--neg)",     label: "High risk" },
  };
  const c = cfg[level];
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", background: c.bg, color: c.color, padding: "2px 7px", borderRadius: "var(--r-sm)" }}>
      {c.label}
    </span>
  );
}

function Sparkline({ apy, w = 80, h = 28 }: { apy: number; w?: number; h?: number }) {
  const pts = [apy * 0.88, apy * 0.91, apy * 0.87, apy * 0.93, apy * 0.96, apy * 0.94, apy];
  const mn = Math.min(...pts), mx = Math.max(...pts);
  const py = (v: number) => ((v - mn) / (mx - mn || 1)) * (h - 4) + 2;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * w} ${h - py(v)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" style={{ opacity: 0.65 }}>
      <path d={d} stroke="var(--pos)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── protocol descriptions ────────────────────────────── */

const PROTOCOL_DETAILS: Record<string, { type: string; desc: string }> = {
  zest: {
    type: "Lending · Principal-protected",
    desc: "Zest Earn lending vault. Deposit sBTC, earn interest. Your principal is returned in full — no impermanent loss.",
  },
  hbtc: {
    type: "Strategy · ~8% target",
    desc: "Hermetica hBTC managed Bitcoin-yield vault. Higher target yield from a delta-neutral + dual-staking strategy. Not principal-guaranteed; withdrawals are processed in two steps.",
  },
};

/* ── page ─────────────────────────────────────────────── */

export function Home() {
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  const { openConnectModal } = useConnectModal();
  const { data: yields } = useYields();
  const { data: vault } = useVaultStats();

  const sorted = useMemo(
    () => [...(yields ?? [])].sort((a, b) => b.apy_percent - a.apy_percent),
    [yields]
  );
  const best = sorted[0];
  const totalTvlUsd = useMemo(
    () => (yields ?? []).reduce((s, y) => s + y.tvl_usd, 0),
    [yields]
  );
  const totalTvlUsdAnimated = useCountUp(totalTvlUsd, 1200, 200);

  const feePct = vault ? (vault.feeBasisPoints / 100).toFixed(0) : "5";
  const tvlCapBtc = vault ? satsToBtc(vault.tvlCapSats) : "0.5";
  // Only show on-chain TVL when it's actually > 0 (vault has deposits)
  const onChainTvlBtc = vault && vault.totalDepositedSats > 0
    ? satsToBtc(vault.totalDepositedSats)
    : null;

  const yieldsLoading = yields === undefined;

  const handleCta = () => (isConnected ? navigate("/yields") : openConnectModal());
  const ctaLabel = isConnected ? "View live yields →" : "Start earning →";

  const stats: [string, string | null, string][] = [
    ["Best APY right now",  best ? `${formatApy(best.apy_percent)}%` : null, "var(--pos)"],
    ["Total value locked",  totalTvlUsd > 0 ? formatTvl(totalTvlUsdAnimated) : null, "var(--text)"],
    ["Protocols tracked",   "2",          "var(--text)"],
    [`Fee (yield only)`,    `${feePct}%`, "var(--accent2)"],
  ];

  return (
    <div className="pb-20 sm:pb-0">

      {/* ── HERO ────────────────────────────────────────── */}
      <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--border)" }}>
        <HeroGlow />
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "clamp(48px,8vw,76px) 24px clamp(40px,6vw,60px)", position: "relative", zIndex: 1, textAlign: "center" }}>

          {/* Live rate + beta badge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 26, flexWrap: "wrap" }}>
            {best && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", padding: "6px 14px", animation: "fadeUp .5s both" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--pos)", animation: "pulseDot 1.8s ease-in-out infinite" }} />
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: ".04em", color: "var(--muted)" }}>
                  Best rate today:{" "}
                  <strong style={{ color: "var(--pos)" }}>{formatApy(best.apy_percent)}% APY</strong>{" "}
                  on {PROTOCOLS[best.protocol].name}
                </span>
              </div>
            )}
            <BetaBadge />
          </div>

          <h1 style={{ fontSize: "clamp(36px,7vw,60px)", fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1.04, marginBottom: 20, animation: "fadeUp .5s .06s both" }}>
            Earn the best sBTC yield<br />on Stacks.<span style={{ color: "var(--accent)" }}> Automatically.</span>
          </h1>

          <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "var(--muted)", lineHeight: 1.7, maxWidth: 560, margin: "0 auto 34px", animation: "fadeUp .5s .12s both" }}>
            SatoshiYield routes your sBTC into vetted, principal-protected yield on
            Stacks — Zest lending today, Hermetica hBTC strategy yield, more coming soon.
            Non-custodial. No lock-up. {feePct}% fee on yield only.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", animation: "fadeUp .5s .18s both" }}>
            <button onClick={handleCta}
              style={{ background: "var(--accent)", color: "var(--onAccent)", border: "none", borderRadius: "var(--r)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, padding: "15px 28px", cursor: "pointer", transition: "transform .12s" }}
              onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseOut={e => e.currentTarget.style.transform = "none"}
            >
              {ctaLabel}
            </button>
            <button onClick={() => navigate("/tvl")}
              style={{ background: "transparent", color: "var(--accent)", border: "1.5px solid var(--accent)", borderRadius: "var(--r)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, padding: "14px 26px", cursor: "pointer", transition: "background .15s" }}
              onMouseOver={e => e.currentTarget.style.background = "var(--accentD)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              See TVL stats →
            </button>
          </div>

          {/* stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 12, marginTop: 54, animation: "fadeUp .5s .26s both" }}>
            {stats.map(([label, val, col]) => (
              <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 14px", textAlign: "left" }}>
                {yieldsLoading && val === null ? (
                  <div className="skeleton" style={{ height: 28, width: "60%", marginBottom: 4 }} />
                ) : (
                  <div style={{ fontSize: 24, fontWeight: 700, color: col, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {val ?? "—"}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────── */}
      <section style={{ maxWidth: 920, margin: "0 auto", padding: "clamp(48px,6vw,64px) 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: ".14em", color: "var(--accent)", marginBottom: 10 }}>HOW IT WORKS</div>
          <h2 style={{ fontSize: "clamp(26px,4vw,36px)", fontWeight: 700, letterSpacing: "-0.035em", margin: 0 }}>Three taps to earn</h2>
        </div>
        <div className="grid sm:grid-cols-3" style={{ gap: 16 }}>
          {[
            {
              n: "01",
              title: "Connect Leather",
              desc: "Link your Stacks wallet — takes 10 seconds. Your keys never leave your device.",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="6" width="18" height="13" rx="3" stroke="var(--accent)" strokeWidth="1.8"/>
                  <path d="M16 11h2" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M3 9h18" stroke="var(--accent)" strokeWidth="1.8"/>
                </svg>
              ),
            },
            {
              n: "02",
              title: "See live rates",
              desc: "SatoshiYield fetches real-time APY from vetted Stacks protocols and ranks them for you. We highlight the best.",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M4 16l5-5 4 3 6-7" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="19" cy="7" r="1.6" fill="var(--accent)"/>
                </svg>
              ),
            },
            {
              n: "03",
              title: "Deposit sBTC",
              desc: "Sign one transaction. Your sBTC goes into vault-v6 on Stacks — a non-custodial Clarity contract — and starts earning.",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="8" stroke="var(--accent)" strokeWidth="1.8"/>
                  <path d="M12 8v4l2.5 2" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
            },
          ].map(({ n, title, desc, icon }) => (
            <div key={title} className="card-hover" style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "26px 22px", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "var(--r)", background: "var(--accentD)", marginBottom: 18 }}>{icon}</div>
              <div style={{ position: "absolute", top: 22, right: 22, fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--lo)" }}>{n}</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.02em" }}>{title}</div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LIVE YIELDS PREVIEW ─────────────────────────── */}
      <section style={{ maxWidth: 920, margin: "0 auto", padding: "8px 24px clamp(48px,6vw,64px)" }}>
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 26px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Live rates right now</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>Live sBTC yield on Stacks · refreshed every 5 min</div>
            </div>
            <LiveDot />
          </div>

          {sorted.length === 0 ? (
            <div style={{ padding: "32px 26px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><MarkSC size={36} pulse /></div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em" }}>LOADING YIELDS…</div>
            </div>
          ) : (
            sorted.slice(0, 3).map((y, i) => {
              const meta = PROTOCOLS[y.protocol];
              return (
                <div key={y.protocol} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 26px", borderBottom: i < 2 ? "1px solid var(--border)" : "none", background: i === 0 ? "var(--accentD)" : "transparent" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: meta.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>{meta.abbr}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{meta.name}</span>
                      {i === 0 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", background: "var(--accent)", color: "var(--onAccent)", padding: "2px 7px", borderRadius: "var(--r-sm)" }}>★ BEST</span>}
                      <RiskPill level={y.risk_level} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{PROTOCOL_DETAILS[y.protocol]?.type}</div>
                  </div>
                  <div className="hidden sm:block"><Sparkline apy={y.apy_percent} /></div>
                  <div style={{ textAlign: "right", minWidth: 64 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--pos)", lineHeight: 1 }}>{formatApy(y.apy_percent)}%</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "var(--muted)", marginTop: 3, letterSpacing: ".06em" }}>APY</div>
                  </div>
                </div>
              );
            })
          )}

          <div style={{ padding: "16px 26px", display: "flex", justifyContent: "center" }}>
            <button onClick={() => navigate("/yields")}
              style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: "var(--r)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 500, padding: "10px 22px", cursor: "pointer" }}>
              See all yields →
            </button>
          </div>
        </div>
      </section>

      {/* ── PROTOCOLS ───────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg2)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "clamp(48px,6vw,64px) 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: ".14em", color: "var(--accent)", marginBottom: 10 }}>SUPPORTED PROTOCOLS</div>
            <h2 style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 700, letterSpacing: "-0.035em", margin: 0 }}>Vetted Stacks protocols, one vault</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, maxWidth: 480, margin: "10px auto 0" }}>
              SatoshiYield routes through Clarity contracts deployed on Stacks mainnet.
              Pick one and switch anytime — no lock-ups.
            </p>
          </div>
          <div className="grid sm:grid-cols-2" style={{ gap: 14 }}>
            {sorted.map((y) => {
              const meta = PROTOCOLS[y.protocol];
              const detail = PROTOCOL_DETAILS[y.protocol] ?? { type: "—", desc: "—" };
              return (
                <div key={y.protocol} className="card-hover" style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "20px 22px", display: "flex", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: meta.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>{meta.abbr}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{meta.name}</span>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: ".04em" }}>{detail.type}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginBottom: 10 }}>{detail.desc}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <RiskPill level={y.risk_level} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pos)" }}>{formatApy(y.apy_percent)}% APY</span>
                      {y.tvl_usd > 0 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "var(--lo)" }}>{formatTvl(y.tvl_usd)} TVL</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && [
              { id: "zest", name: "Zest",            abbr: "ZE", color: "oklch(64% .19 150)" },
              { id: "hbtc", name: "Hermetica hBTC",  abbr: "hB", color: "oklch(70% .17 55)" },
            ].map((p) => (
              <div key={p.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "20px 22px", display: "flex", gap: 14, opacity: 0.5 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: p.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.abbr}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 15, paddingTop: 12 }}>{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY ────────────────────────────────────── */}
      <section style={{ maxWidth: 920, margin: "0 auto", padding: "clamp(48px,6vw,64px) 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: ".14em", color: "var(--accent2)", marginBottom: 10 }}>SECURITY ARCHITECTURE</div>
          <h2 style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 700, letterSpacing: "-0.035em", margin: 0 }}>Safe by design</h2>
        </div>
        <div className="grid sm:grid-cols-2" style={{ gap: 14 }}>
          {[
            {
              title: "Non-custodial vault",
              desc: `Your sBTC is held in vault-v6 — a Clarity 3 contract on Stacks mainnet. We cannot access or move your funds. Only you can withdraw.`,
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" stroke="var(--accent2)" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="var(--accent2)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            },
            {
              title: "Timelocked fee changes",
              desc: `The protocol fee (${feePct}% on yield, never on principal) requires a 24-hour on-chain timelock before any update can take effect.`,
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--accent2)" strokeWidth="1.7"/><path d="M12 7v5l3 3" stroke="var(--accent2)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            },
            {
              title: "TVL cap for safe launch",
              desc: `Mainnet beta runs with a ${tvlCapBtc} sBTC deposit cap. This hard limit is enforced on-chain by vault-v6 and raised incrementally as the protocol matures.`,
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="var(--accent2)" strokeWidth="1.7" strokeLinejoin="round"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="var(--accent2)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            },
            {
              title: "No lock-up, ever",
              desc: "You can withdraw your full principal at any time. No lock periods. No vesting. If you change your mind, just tap Withdraw.",
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 10V8a5 5 0 0 1 9.5-2" stroke="var(--accent2)" strokeWidth="1.7" strokeLinecap="round"/><rect x="5" y="10" width="14" height="10" rx="2.5" stroke="var(--accent2)" strokeWidth="1.7"/></svg>,
            },
          ].map(({ title, desc, icon }) => (
            <div key={title} className="card-hover" style={{ display: "flex", gap: 14, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "22px 20px" }}>
              <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: "var(--r)", background: "var(--accent2D)", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* audit-pending disclosure */}
        {/* <div style={{ marginTop: 16, display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 18px", borderRadius: "var(--r)", background: "color-mix(in oklch, var(--warn) 7%, transparent)", border: "1px solid color-mix(in oklch, var(--warn) 25%, transparent)" }}>
          <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--warn)" }}>Audit pending.</strong>{" "}
            The vault and adapters are pending an external audit. <strong>Zest Earn</strong> (lending) is
            principal-protected. <strong>Hermetica hBTC</strong> is a managed strategy — not principal-guaranteed:
            a small exit fee applies, withdrawals are funded by Hermetica after a cooldown, and a redemption may
            return <em>less</em> sBTC than deposited. Only deposit what you can afford to lose.
          </span>
        </div> */}
      </section>

      {/* ── FINAL CTA ───────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg2)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "clamp(52px,7vw,72px) 24px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <div style={{ animation: "floaty 4s ease-in-out infinite" }}><MarkSC size={56} pulse /></div>
          </div>
          <h2 style={{ fontSize: "clamp(28px,5vw,42px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 16 }}>
            Your sBTC could be earning{" "}
            <span style={{ color: "var(--pos)" }}>{best ? `${formatApy(best.apy_percent)}%` : "yield"}</span>{" "}
            today.
          </h2>
          <p style={{ fontSize: 16, color: "var(--muted)", maxWidth: 440, margin: "0 auto 30px", lineHeight: 1.6 }}>
            No signup. No lock-up. Connect your Leather wallet and start earning on Stacks.{" "}
            {onChainTvlBtc && <span style={{ color: "var(--accent)" }}>{onChainTvlBtc} sBTC already deposited.</span>}
          </p>
          <button onClick={handleCta}
            style={{ background: "var(--accent)", color: "var(--onAccent)", border: "none", borderRadius: "var(--r)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, padding: "16px 34px", cursor: "pointer", transition: "transform .12s" }}
            onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseOut={e => e.currentTarget.style.transform = "none"}
          >
            {ctaLabel}
          </button>
        </div>
      </section>

    </div>
  );
}
