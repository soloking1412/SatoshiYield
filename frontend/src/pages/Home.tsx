import { Link } from "react-router-dom";
import { useVaultStats } from "../hooks/useVaultStats.js";
import { useYields, MAX_YIELD_AGE_MS } from "../hooks/useYields.js";
import { PROTOCOLS } from "../constants/protocols.js";
import { DEPOSITS_ENABLED, VAULT_VERSION } from "../constants/contracts.js";
import { networkName } from "../lib/stacksClient.js";
import { Icon } from "../components/shared/Icon.js";
import { YieldTable } from "../components/yields/YieldTable.js";

export function Home() {
  const vault = useVaultStats();
  const yields = useYields();
  const principal = vault.isError ? undefined : vault.data?.totalDepositedSats;
  const reporting = yields.data?.filter((y) => !y.apy_stale && Date.now() - y.fetched_at <= MAX_YIELD_AGE_MS).length ?? 0;
  return <main id="main-content" className="page-shell" tabIndex={-1}>
    <section className="hero-layout" aria-labelledby="home-heading">
      <div>
        <p className="eyebrow">Bitcoin, working with clarity</p>
        <h1 id="home-heading">Bitcoin capital.<br /><span>The details<br className="hidden sm:block" /> in view.</span></h1>
        <p className="hero-copy">Explore yield routes on Stacks with the asset, withdrawal terms, and integration status alongside every strategy.</p>
        <div className="hero-actions"><Link className="btn primary" to="/yields">Explore strategies <Icon name="arrow" size={16} /></Link><Link className="text-link" to="/tvl">Inspect the vault <Icon name="external" size={13} /></Link></div>
        <p className="hero-footnote">sBTC lending · Managed strategies · Stacking research<br />Different assets. Different risks. Always visible.</p>
      </div>
      <aside className="capital-panel" aria-label="Vault snapshot">
        <div className="capital-panel-head"><span>Vault snapshot / {VAULT_VERSION}</span><span>{networkName}</span></div>
        <div className="amount">{principal === undefined ? "—" : (principal / 1e8).toFixed(8)} <small>sBTC</small></div>
        <p className="caption">Recorded deposited principal</p>
        <dl className="definition-list">
          <div><dt>Deposit access</dt><dd><span className={`status-label ${DEPOSITS_ENABLED ? "positive" : "warning"}`}>{DEPOSITS_ENABLED ? "Enabled by configuration" : "Release review required"}</span></dd></div>
          <div><dt>Listed strategies</dt><dd>{Object.keys(PROTOCOLS).length} sBTC strategies</dd></div>
          <div><dt>Fresh rate feeds</dt><dd>{yields.isError ? "Unavailable" : yields.isLoading ? "Checking…" : `${reporting} reporting`}</dd></div>
          <div><dt>Source</dt><dd>{vault.isError ? "On-chain data unavailable" : vault.isLoading ? "Reading vault…" : vault.data ? "Stacks contract read" : "Vault not configured"}</dd></div>
        </dl>
        <Link className="text-link" to="/tvl" style={{ marginTop: 20 }}>View contracts & data <Icon name="arrow" size={14} /></Link>
      </aside>
    </section>
    <section className="flow-section" aria-labelledby="flow-heading">
      <div className="section-heading"><h2 id="flow-heading">Know the route your capital takes.</h2><span className="mono small text-muted">01 → 03</span></div>
      <div className="capital-flow">
        <div className="flow-step"><span className="flow-index">01 /</span><h3>Your wallet</h3><p>Hold the right asset on the right network. Review every transaction before signing.</p></div><Icon name="arrow" style={{ color: "var(--lo)" }} />
        <div className="flow-step"><span className="flow-index">02 /</span><h3>A defined strategy</h3><p>When enabled, an approved adapter connects the vault to a specific protocol.</p></div><Icon name="arrow" style={{ color: "var(--lo)" }} />
        <div className="flow-step"><span className="flow-index">03 /</span><h3>A clear exit</h3><p>Review liquidity, cooldowns, and claim requirements before committing capital.</p></div>
      </div>
    </section>
    <section className="directory-section" aria-labelledby="home-directory"><div className="section-heading"><div><h2 id="home-directory">The integration register</h2><p>Availability is separate from a protocol’s market rate.</p></div><Link className="text-link" to="/yields">Explore all <Icon name="arrow" size={14} /></Link></div><YieldTable compact /></section>
  </main>;
}
