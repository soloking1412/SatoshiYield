import { useEffect, useRef, useState } from "react";
import type { BondObservation } from "../../../integrations/pox5/src/index.mjs";
import { useWallet } from "../context/WalletContext.js";
import { useConnectModal } from "../context/ConnectModalContext.js";
import { parseSbtcAmount, formatSbtcAmount } from "../lib/amount.js";
import { networkName } from "../lib/stacksClient.js";
import { Icon } from "./shared/Icon.js";

export function NativeBitcoinBond() {
  const { address } = useWallet(); const { openConnectModal } = useConnectModal();
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false);
  const [state, setState] = useState<BondObservation | null>(null); const [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(() => { epoch.current++; setState(null); setError(""); setBusy(false); }, [address, amount]);
  useEffect(() => () => { epoch.current++; }, []);
  async function check() {
    if (!address) return; const active = ++epoch.current; setBusy(true); setState(null); setError("");
    try { const api = await import("../../../integrations/pox5/src/index.mjs"); const result = await api.createPox5Client({ network: networkName }).observe({ address, amountSats: parseSbtcAmount(amount) }); if (active === epoch.current) setState(result); }
    catch (e) { if (active === epoch.current) setError(e instanceof Error ? e.message : "Bond eligibility could not be verified."); } finally { if (active === epoch.current) setBusy(false); }
  }
  return <section className="native-bond" aria-labelledby="native-bond-heading"><div className="section-heading"><div><p className="eyebrow">Native Bitcoin · Stacks PoX-5</p><h2 id="native-bond-heading">Check bond eligibility.</h2></div><span className="status-label neutral">Read-only</span></div><p className="route-description">Check the next bond’s registration window, your allowance, and the paired STX commitment before considering a Bitcoin lock. This check does not fund or register a stake.</p>
    <div className="notice"><Icon name="info" /><div>{networkName === "testnet" ? "Stacks testnet uses Bitcoin regtest for this route. Babylon and Lombard use Signet. These coins and networks are not interchangeable." : "This route checks native Bitcoin on mainnet. The Babylon and Lombard panels above are separate test-network preparations."}</div></div>
    {!address ? <button className="btn primary" onClick={openConnectModal}>Connect Stacks wallet</button> : <><label className="field-label" htmlFor="native-bond-amount">Bitcoin amount to evaluate</label><div className="native-bond-input"><div className="amount-input"><input id="native-bond-amount" inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /><span>BTC</span></div><button className="btn primary" disabled={busy || !amount} onClick={() => void check()}>{busy ? "Checking eligibility…" : "Check eligibility"}</button></div></>}
    {error && <div className="notice error" role="alert"><Icon name="info" /><div>{error}</div></div>}{busy && <p role="status" className="small text-muted">Reading the announced bond and wallet allowance.</p>}
    {state && <div className="native-bond-result"><dl className="definition-list"><div><dt>Next bond</dt><dd>#{state.bondIndex} · {state.status}</dd></div><div><dt>Your allowance</dt><dd>{formatSbtcAmount(state.allowance)} BTC</dd></div><div><dt>Paired STX commitment</dt><dd>{state.requiredUstx === null ? "Not available" : `${state.requiredUstx / 1_000_000n}.${(state.requiredUstx % 1_000_000n).toString().padStart(6, "0")} STX`}</dd></div><div><dt>Bitcoin network</dt><dd>{state.bitcoinNetwork}</dd></div><div><dt>Funding enabled</dt><dd>No · eligibility check only</dd></div></dl><ul className="bond-reasons">{state.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p className="route-note">Last checked {new Date(state.observedAt).toLocaleString()}. Bitcoin remains locked by its timelock even if Stacks registration fails. Do not send funds based on this eligibility result.</p></div>}
  </section>;
}
