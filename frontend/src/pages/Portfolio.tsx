import { Link } from "react-router-dom";
import { useWallet } from "../context/WalletContext.js";
import { usePositions } from "../hooks/usePositions.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { PositionCard } from "../components/portfolio/PositionCard.js";
import { EmptyPortfolio } from "../components/portfolio/EmptyPortfolio.js";
import { Icon } from "../components/shared/Icon.js";
import { formatSbtcAmount } from "../lib/amount.js";
import { CONTRACTS, VAULT_VERSION } from "../constants/contracts.js";
import { networkName } from "../lib/stacksClient.js";
import { GetSbtcButton } from "../components/wallet/GetSbtcButton.js";
import { FaucetButton } from "../components/wallet/FaucetButton.js";
import { TransactionActivity } from "../components/portfolio/TransactionActivity.js";
import { ProtocolHoldings } from "../components/portfolio/ProtocolHoldings.js";

export function Portfolio() {
  const { isConnected, address } = useWallet();
  const { positions, isLoading, isError, refetch } = usePositions();
  const { openConnectModal } = useConnectModal();
  const total = positions.reduce((sum, position) => sum + position.principalSats, 0n);
  return <main id="main-content" className="page-shell narrow" tabIndex={-1}>
    <div className="page-intro"><div><p className="eyebrow">Your capital, accounted for</p><h1>Your portfolio.</h1><p>Review recorded principal and withdrawal status for the configured vault. Transaction submission and on-chain confirmation are separate steps.</p></div>{isConnected && <button className="btn ghost" disabled={isLoading} onClick={() => void refetch()}><Icon name="refresh" size={14} />Refresh</button>}</div>
    {!isConnected ? <div className="state-panel"><div className="state-symbol"><Icon name="wallet" size={25} /></div><h2>A wallet brings your positions into view.</h2><p>Connect a Stacks wallet to read your positions on {networkName}. Connecting does not authorize any transaction.</p><button className="btn primary" onClick={openConnectModal}>Connect wallet <Icon name="arrow" size={15} /></button><Link className="text-link" to="/yields">Explore strategies first</Link></div> : <>
      <div className="portfolio-header"><span className="contract-address">{address}</span><div style={{ display: "flex", gap: 9 }}><GetSbtcButton /><FaucetButton /></div></div>
      {isLoading ? <div className="state-panel" role="status"><span className="spinner" /><h2>Reading your positions</h2><p>Checking the configured contracts on Stacks {networkName}.</p></div> : isError ? <div className="state-panel" role="alert"><div className="state-symbol"><Icon name="info" size={25} /></div><h2>Positions could not be verified.</h2><p>A failed contract read does not mean your balance is zero. Retry or inspect the vault directly.</p><button className="btn primary" onClick={() => void refetch()}>Retry contract read</button><a className="text-link" href={`https://explorer.hiro.so/address/${CONTRACTS.VAULT}?chain=${networkName}`} target="_blank" rel="noopener noreferrer">Inspect the vault <Icon name="external" size={13} /></a></div> : positions.length ? <>
        <dl className="metrics"><div className="metric"><dt>Total recorded principal</dt><dd>{formatSbtcAmount(total)}<small>sBTC</small></dd><p>Not a current redemption estimate</p></div><div className="metric"><dt>Positions in this vault</dt><dd>{positions.length}</dd><p>{VAULT_VERSION} · {networkName}</p></div><div className="metric"><dt>Pending redemptions</dt><dd>{positions.filter((position) => position.status === "pending").length}</dd><p>Funding required before a claim</p></div></dl>
        <div className="position-list">{positions.map((position) => <PositionCard key={position.adapter} position={position} />)}</div>
      </> : <EmptyPortfolio />}
      <p className="directory-footnote">This view reads {VAULT_VERSION} positions for the configured adapters. It does not aggregate balances across other vault versions or unrelated protocols. <Link className="text-link" to="/tvl">Verify configured contracts</Link></p>
      <div className="notice"><Icon name="wallet" /><div>Direct Zest and StackingDAO receipts stay in your wallet. <Link to="/integrations">Check protocol balances and withdrawal routes</Link>.</div></div>
      <ProtocolHoldings />
      <TransactionActivity />
    </>}
  </main>;
}
