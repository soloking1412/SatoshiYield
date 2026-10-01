import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Observation, ProtocolId, Quote, StacksIntegrationClient } from "../../../integrations/stacks/src/index.mjs";
import { useWallet } from "../context/WalletContext.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { networkName } from "../lib/stacksClient.js";
import { formatSbtcAmount, parseSbtcAmount } from "../lib/amount.js";
import { Icon } from "./shared/Icon.js";

const protocols = { "zest-sbtc": { name: "Zest", receipt: "zsBTC", description: "Supply sBTC to the current Zest lending vault. Your receipt stays in your wallet; redemption depends on available lending liquidity." }, "stackingdao-stbtc": { name: "StackingDAO", receipt: "stBTC", description: "Deposit sBTC for stBTC. Use available reserve liquidity for an immediate exit, or claim an existing withdrawal NFT after its lock ends." } };
const message = (error: unknown) => error instanceof Error ? error.message : "The protocol could not be verified. Try again.";
const amount = (value: bigint, symbol: string) => `${formatSbtcAmount(value)} ${symbol}`;
export function StacksRoutes() {
  const [search] = useSearchParams();
  const { address, callContract } = useWallet();
  const { openConnectModal } = useConnectModal();
  const [protocol, setProtocol] = useState<ProtocolId>(() => search.get("protocol") === "stackingdao-stbtc" ? "stackingdao-stbtc" : "zest-sbtc");
  const [action, setAction] = useState<Quote["action"]>(() => search.get("action") === "redeem" ? "redeem" : search.get("protocol") === "stackingdao-stbtc" && search.get("action") === "claim" ? "claim" : "deposit");
  const [input, setInput] = useState("");
  const [state, setState] = useState<Observation | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState("");
  const client = useRef<StacksIntegrationClient | null>(null);
  const epoch = useRef(0);
  const details = protocols[protocol];
  useEffect(() => { epoch.current++; setQuote(null); setState(null); setConsent(false); setError(""); setSubmitted(""); setBusy(""); }, [address, protocol, action]);
  useEffect(() => () => { epoch.current++; }, []);
  function clearInput(value: string) { epoch.current++; setInput(value); setQuote(null); setConsent(false); setError(""); setSubmitted(""); }
  async function api() { if (!client.current) client.current = (await import("../../../integrations/stacks/src/index.mjs")).createStacksIntegrationClient(); return client.current; }
  async function observe() {
    if (!address || networkName !== "mainnet") throw new Error("These published protocol routes require a Stacks mainnet wallet.");
    const sdk = await api();
    const observation = action === "claim" ? await sdk.readClaimState(address) : await sdk.readState(protocol, address);
    return { sdk, observation };
  }
  async function inspect(prepare: boolean) {
    const active = ++epoch.current; setBusy(prepare ? "Checking quote and protections…" : "Verifying protocol and balances…"); setQuote(null); setConsent(false); setError(""); setState(null); setSubmitted("");
    try {
      const { sdk, observation } = await observe();
      const result = prepare ? action === "claim" ? await sdk.readClaim(observation, input) : await sdk.quote(observation, action, parseSbtcAmount(input)) : null;
      if (active !== epoch.current) return;
      setState(observation); setQuote(result);
    } catch (e) { if (active === epoch.current) setError(message(e)); } finally { if (active === epoch.current) setBusy(""); }
  }
  async function submit() {
    if (!quote || !consent || !address) return;
    const reviewed = quote; const active = ++epoch.current; setBusy("Rechecking before your wallet opens…"); setError("");
    try {
      const { sdk, observation } = await observe();
      const fresh = reviewed.action === "claim" ? await sdk.readClaim(observation, reviewed.claimId!) : await sdk.quote(observation, reviewed.action, reviewed.amount);
      if (active !== epoch.current) return;
      // Never relax the displayed minimum, fee, duration or owner during a refresh.
      if (fresh.owner !== reviewed.owner || fresh.minimumOut < reviewed.minimumOut || fresh.fee > reviewed.fee || (reviewed.maxFeeBps !== undefined && reviewed.maxFeeBps !== null && (fresh.maxFeeBps ?? 0n) > reviewed.maxFeeBps) || (fresh.maxCooldownBurnBlocks ?? 0n) > (reviewed.maxCooldownBurnBlocks ?? 0n) || (fresh.unlockBurnHeight ?? 0n) > (reviewed.unlockBurnHeight ?? 0n)) {
        setQuote(fresh); setState(observation); setConsent(false); throw new Error("The quote changed. Review the updated minimum, fee and wait before continuing.");
      }
      const route = sdk.buildUnsignedRoute(fresh, { walletAddress: address, network: networkName });
      const txid = await callContract({ ...route.transaction, expectedSender: reviewed.owner, postConditionMode: "deny" });
      if (active !== epoch.current) return;
      setSubmitted(txid); setQuote(null); setState(null); setConsent(false);
    } catch (e) { if (active === epoch.current) setError(message(e)); } finally { if (active === epoch.current) setBusy(""); }
  }
  return <div className="integration-layout">
    <aside className="route-directory" aria-label="Stacks protocols">
      {(Object.keys(protocols) as ProtocolId[]).map(id => <button key={id} className="route-choice" aria-pressed={protocol === id} disabled={!!busy} onClick={() => { setProtocol(id); setAction("deposit"); clearInput(""); }}><span className="protocol-icon">{id === "zest-sbtc" ? "Z" : "S"}</span><span><strong>{protocols[id].name}</strong><small>sBTC → {protocols[id].receipt}</small></span><Icon name="arrow" size={16} /></button>)}
      <div className="route-principles"><span className="eyebrow">Direct protocol positions</span><p>Receipts belong to your wallet. These routes do not deposit into the SatoshiYield vault.</p><p>Contract code and current permissions are checked before each review. Protocol governance, liquidity and loss risks still apply.</p><Link className="text-link" to="/security">Read risk & release notes <Icon name="arrow" size={13} /></Link></div>
    </aside>
    <section className="route-workspace" aria-labelledby="route-heading">
      <div className="route-heading"><div><p className="eyebrow">Stacks mainnet · sBTC</p><h2 id="route-heading">{details.name}</h2></div><span className="status-label neutral">Verify before use</span></div>
      <p className="route-description">{details.description}</p>
      <div className="filter-group route-actions" aria-label="Choose protocol action">{(["deposit", "redeem", ...(protocol === "stackingdao-stbtc" ? ["request", "claim"] : [])] as Quote["action"][]).map(value => <button className="filter-button" disabled={!!busy} key={value} aria-pressed={action === value} onClick={() => { setAction(value); clearInput(""); }}>{value === "redeem" ? "Withdraw" : value === "request" ? "Queue exit" : value === "claim" ? "Claim NFT" : "Deposit"}</button>)}</div>
      {networkName !== "mainnet" ? <div className="notice"><Icon name="info" /><div>Current official deployments are on mainnet. This app is configured for {networkName}; these wallet actions are unavailable here. Mainnet fork tests do not constitute public testnet deployment.</div></div> : !address ? <div className="route-connect"><Icon name="wallet" size={25} /><h3>Connect to inspect your route.</h3><p>Read balances and current protocol availability before reviewing an action.</p><button className="btn primary" onClick={openConnectModal}>Connect Stacks wallet</button></div> : <>
        <div className="route-balance"><span>{state ? `Available ${amount(state.assetBalance, "sBTC")} · ${amount(state.receiptBalance, details.receipt)}` : "Balances have not been checked"}</span><button className="text-link" disabled={!!busy} onClick={() => void inspect(false)}>Refresh balances</button></div>
        <label className="field-label" htmlFor="route-amount">{action === "claim" ? "Withdrawal NFT ID" : `Amount to ${action === "deposit" ? "deposit" : "withdraw"}`}</label>
        <div className="amount-input"><input id="route-amount" inputMode={action === "claim" ? "numeric" : "decimal"} autoComplete="off" placeholder={action === "claim" ? "e.g. 2" : "0.00"} value={input} disabled={!!busy} onChange={e => clearInput(e.target.value)} /><span>{action === "claim" ? "NFT" : action === "deposit" ? "sBTC" : details.receipt}</span></div>
        {action === "request" && <p className="route-note">New queue requests require our reviewed atomic guard to be deployed. Quotes show the entitlement and current wait, but request signing remains disabled until that deployment is configured.</p>}
        {action === "claim" && <p className="route-note">Enter an existing withdrawal NFT you own. Claims check their recorded entitlement and reserve liquidity independently of new deposit conditions.</p>}
        <button className="btn primary route-review-button" disabled={!input || !!busy} onClick={() => void inspect(true)}>{busy || (action === "claim" ? "Check claim" : "Review quote")}<Icon name="arrow" size={15} /></button>
        {busy && <p className="small text-muted" role="status">{busy}</p>}
        {error && <div className="notice error" role="alert"><Icon name="info" /><div>{error}</div></div>}
        {quote && <div className="route-review" aria-live="polite"><div className="section-heading"><h3>Review this action</h3><span className="small text-muted">{action === "claim" ? "Exact claim payout" : "0.5% output tolerance"}</span></div>
          <dl className="definition-list"><div><dt>{action === "request" ? "Estimated future entitlement" : "Expected output"}</dt><dd>{amount(quote.expectedOut, action === "deposit" ? details.receipt : "sBTC")}</dd></div><div><dt>{action === "request" ? "Minimum future entitlement" : "Minimum output"}</dt><dd className="text-accent">{amount(quote.minimumOut, action === "deposit" ? details.receipt : "sBTC")}</dd></div><div><dt>{action === "claim" ? "Recorded claim fee" : "Estimated protocol fee"}</dt><dd>{amount(quote.fee, "sBTC")}<small className="route-note">Network fee shown by your wallet</small></dd></div>{action === "request" && quote.maxFeeBps != null && <div><dt>Maximum queue fee</dt><dd>{quote.maxFeeBps.toString()} basis points</dd></div>}{quote.maxCooldownBurnBlocks != null && <div><dt>Maximum initial wait</dt><dd>{quote.maxCooldownBurnBlocks.toString()} Bitcoin burn blocks</dd></div>}{quote.unlockBurnHeight !== undefined && <div><dt>Claim unlock height</dt><dd>{quote.unlockBurnHeight.toString()}<small className="route-note">Current burn height {quote.state.burnHeight}</small></dd></div>}<div><dt>Recipient</dt><dd className="mono small">{quote.owner}</dd></div><div><dt>Approval transaction</dt><dd>None required</dd></div></dl>
          <p className="route-note">The minimum output limits the final payout. For an idle exit, protocol fees can change before confirmation within that payout limit.</p>
          <p className="route-note">{quote.state.sources.length} contract source hashes checked at Stacks block {quote.state.stacksHeight}. All amounts use exact token units. Unexpected outgoing assets are rejected.</p>
          {protocol === "stackingdao-stbtc" && <p className="route-note">StackingDAO governance can change protocol permissions and existing claim records. A burn-block wait is not a guaranteed completion time.</p>}
          {!quote.executable ? <div className="notice"><Icon name="info" /><div>{quote.reason}</div></div> : <><label className="risk-check"><input type="checkbox" checked={consent} disabled={!!busy} onChange={e => setConsent(e.target.checked)} /><span>I reviewed the minimum output and fees. Protocol losses are possible, and wallet submission still needs on-chain confirmation.</span></label><button className="btn primary" disabled={!consent || !!busy} onClick={() => void submit()}>Continue in wallet <Icon name="arrow" size={15} /></button></>}
        </div>}
        {submitted && <div className="notice" role="status"><Icon name="info" /><div><strong>Submitted. Confirmation is pending.</strong><p>Follow the verified receipt in <Link to="/portfolio">Portfolio activity</Link>.</p><a className="text-link" href={`https://explorer.hiro.so/txid/${submitted}?chain=mainnet`} target="_blank" rel="noopener noreferrer">View transaction <Icon name="external" size={13} /></a></div></div>}
      </>}
    </section>
  </div>;
}
