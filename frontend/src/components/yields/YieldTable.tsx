import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useYields, MAX_YIELD_AGE_MS } from "../../hooks/useYields.js";
import { YieldRow } from "./YieldRow.js";
import { PROTOCOLS, COMING_SOON, type ProtocolId } from "../../constants/protocols.js";
import { DEPOSITS_ENABLED, DEPOSIT_BLOCK_REASON } from "../../constants/contracts.js";
import { Icon } from "../shared/Icon.js";

export function YieldTable({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, isError } = useYields();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = Object.entries(PROTOCOLS).filter(([, meta]) => (category === "all" || meta.kind === category) && `${meta.name} ${meta.blurb} sBTC`.toLowerCase().includes(query.toLowerCase().trim()));
  const research = !compact && category === "all" ? COMING_SOON.filter((meta) => `${meta.name} ${meta.blurb} ${meta.asset}`.toLowerCase().includes(query.toLowerCase().trim())) : [];
  const freshCount = data?.filter((y) => !y.apy_stale && Date.now() - y.fetched_at <= MAX_YIELD_AGE_MS).length ?? 0;
  return <div>
    {!compact && !DEPOSITS_ENABLED && <div className="notice"><Icon name="shield" size={18} /><div><strong>Deposit access:</strong> {DEPOSIT_BLOCK_REASON}</div></div>}
    {!compact && <div className="toolbar"><div className="filter-group" role="group" aria-label="Strategy category">{[["all", "All strategies"], ["lending", "Lending"], ["strategy", "Managed"]].map(([id, label]) => <button key={id} className="filter-button" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div><label className="search-field"><Icon name="search" size={14} /><span className="sr-only">Search strategies</span><input type="search" placeholder="Search strategies" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>}
    {isError && <div className="notice error" role="status" style={{ margin: "0 0 18px" }}><Icon name="info" size={17} /><div><strong>Rate data unavailable.</strong> The data service could not be reached. The integration register remains available. <button className="text-link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => void queryClient.invalidateQueries({ queryKey: ["yields"] })}>Retry</button></div></div>}
    <div className="directory-meta" style={{ marginTop: compact ? 20 : 0 }}><span>{entries.length} listed sBTC {entries.length === 1 ? "strategy" : "strategies"}</span><span aria-live="polite">{isLoading ? "Checking rate sources…" : isError ? "Market data offline" : data?.length === 0 ? "No yield data available" : `${freshCount} fresh rate ${freshCount === 1 ? "feed" : "feeds"}`}</span></div>
    <div className="strategy-head" aria-hidden="true"><span>Strategy / protocol</span><span>Asset</span><span>Reported APY</span><span>Withdrawal</span><span>Availability</span><span /></div>
    <div aria-label="Listed yield strategies" aria-busy={isLoading}>
      {entries.map(([id]) => <YieldRow key={id} protocolId={id as ProtocolId} data={isError ? undefined : data?.find((y) => y.protocol === id)} loading={isLoading} />)}
      {entries.length === 0 && <div className="state-panel"><h2>No matching strategies</h2><p>Try a different protocol name or choose all strategies.</p><button className="btn ghost" onClick={() => { setQuery(""); setCategory("all"); }}>Clear filters</button></div>}
    </div>
    <p className="directory-footnote">Rates are indicative annualized figures reported by the data service, before SatoshiYield fees. They are variable, are not a forecast, and do not establish that a route is available. Protocol risk labels are not independent ratings.</p>
    {research.length > 0 && <><h3 className="research-title">Other protocol connections</h3><div className="research-list">{research.map((meta) => <article key={meta.name} className="research-row"><span className="protocol-icon" aria-hidden="true">{meta.abbr}</span><div><h3>{meta.name}</h3><p>{meta.blurb}</p><div className="research-terms"><span className="mono">{meta.asset}</span><span>{meta.withdrawal}</span><a className="text-link" href={meta.website} target="_blank" rel="noopener noreferrer">Read protocol docs <Icon name="external" size={11} /></a></div></div><div><span className="status-label neutral">{meta.status === "research" ? "Research only" : meta.status === "direct" ? "Direct route" : meta.status === "eligibility" ? "Eligibility only" : "Test preparation"}</span>{meta.status !== "research" && <Link className="text-link" style={{ display: "flex", marginTop: 10 }} to={meta.status === "direct" ? "/integrations?protocol=stackingdao-stbtc" : "/integrations?tab=bitcoin"}>Review connection <Icon name="arrow" size={12} /></Link>}</div></article>)}</div></>}
  </div>;
}
