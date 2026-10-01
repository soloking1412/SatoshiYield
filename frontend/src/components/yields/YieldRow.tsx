import { useId, useState } from "react";
import { MAX_YIELD_AGE_MS } from "../../hooks/useYields.js";
import type { NormalizedYield } from "../../types/yield.js";
import { PROTOCOLS, type ProtocolId } from "../../constants/protocols.js";
import { DEPOSITS_ENABLED, VAULT_VERSION } from "../../constants/contracts.js";
import { useWallet } from "../../context/WalletContext.js";
import { useConnectModal } from "../../context/ConnectModalContext.js";
import { DepositModal } from "../wallet/DepositModal.js";
import { Icon } from "../shared/Icon.js";
import { networkName } from "../../lib/stacksClient.js";
import { formatApy } from "../../lib/format.js";

export function YieldRow({ protocolId, data, loading = false }: { protocolId: ProtocolId; data?: NormalizedYield; loading?: boolean }) {
  const meta = PROTOCOLS[protocolId];
  const { isConnected } = useWallet();
  const { openConnectModal } = useConnectModal();
  const [expanded, setExpanded] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const detailsId = useId();
  const stale = !data || data.apy_stale || Date.now() - data.fetched_at > MAX_YIELD_AGE_MS;
  const simulation = networkName === "testnet" && VAULT_VERSION === "v7";
  const depositAllowed = DEPOSITS_ENABLED && (simulation || (!!data?.is_live_integration && !stale));
  const age = data ? Math.max(0, Math.floor((Date.now() - data.fetched_at) / 60_000)) : 0;
  return <article className="strategy-card">
    <div className="strategy-main">
      <div className="strategy-identity"><span className="protocol-icon" aria-hidden="true">{meta.abbr}</span><div><span className="protocol-name">{meta.name}</span><span className="protocol-kind">{simulation ? "Mock testnet adapter" : meta.kind === "lending" ? "Lending market" : "Managed strategy"}</span></div></div>
      <div className="strategy-cell"><span className="mobile-label">Asset</span>sBTC</div>
      <div className="strategy-cell"><span className="mobile-label">Reported APY</span><strong>{simulation ? "—" : loading ? "…" : data && !stale ? `${formatApy(data.apy_percent)}%` : "—"}</strong><small>{simulation ? "No real yield" : loading ? "Checking source" : !data ? "No verified feed" : stale ? "Stale · unavailable" : age === 0 ? "Updated <1 min ago" : `Updated ${age} min ago`}</small></div>
      <div className="strategy-cell"><span className="mobile-label">Withdrawal</span>{meta.async ? "Request & claim" : "Liquidity dependent"}<small>{meta.async ? "Funding required" : "No fixed lock"}</small></div>
      <div className="strategy-cell"><span className="status-label warning">{depositAllowed ? "Testnet simulation" : "Review required"}</span></div>
      <button className="strategy-action" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Hide" : "View"} ${meta.name} details`} onClick={() => setExpanded(!expanded)}>Details <Icon name="chevron" size={13} style={{ transform: expanded ? "rotate(180deg)" : undefined }} /></button>
    </div>
    {expanded && <div id={detailsId} className="strategy-details"><p>{simulation ? "This mock adapter simulates a protocol interaction with test assets. It does not deposit into the real protocol or establish mainnet readiness." : meta.blurb}</p><p><strong className="text-muted">Capital is at risk.</strong> Contract, liquidity, administration, and underlying strategy risks can affect your funds. A reported rate is not a guarantee.</p><div className="detail-links"><a className="text-link" href={meta.website} target="_blank" rel="noopener noreferrer">Protocol website <Icon name="external" size={12} /></a><button className="btn ghost" disabled={!depositAllowed} onClick={() => isConnected ? setDepositOpen(true) : openConnectModal()}>{depositAllowed ? isConnected ? "Review deposit" : "Connect wallet" : "Deposits unavailable"}</button></div></div>}
    {depositOpen && <DepositModal protocolId={protocolId} data={data} onClose={() => setDepositOpen(false)} />}
  </article>;
}
