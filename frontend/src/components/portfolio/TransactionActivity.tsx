import { useTransactions } from "../../hooks/useTransactions.js";
import { Icon } from "../shared/Icon.js";

const labels = { pending: "Awaiting confirmation", success: "Confirmed on-chain", failed: "Failed on-chain", dropped: "Dropped", unavailable: "Confirmation unavailable", mismatch: "Transaction does not match" };
export function TransactionActivity() {
  const transactions = useTransactions();
  return <section className="transaction-activity" aria-labelledby="activity-heading">
    <div className="section-heading"><div><h2 id="activity-heading">Transaction activity</h2><p>Calls submitted from this browser and connected wallet. Confirmations are checked against the submitted action.</p></div></div>
    {!transactions.length ? <p className="activity-empty">No recorded submissions for this wallet on this network.</p> : <div className="activity-list">{transactions.map(({ call, receipt, isLoading, refresh }) => <article className="activity-row" key={call.txid}>
      <div><h3>{call.functionName.replaceAll("-", " ")}</h3><p className="contract-address">{call.contract}</p><span className="small text-muted">{new Date(call.submittedAt).toLocaleString()} · {call.network}</span></div>
      <div className="activity-state"><span className={`status-label ${receipt?.state === "success" ? "positive" : receipt?.state === "failed" || receipt?.state === "mismatch" ? "warning" : "neutral"}`}>{receipt ? labels[receipt.state] : "Checking submission"}</span><p>{receipt?.detail ?? "Submission is not confirmation."}</p>{receipt?.bitcoinConfirmations !== undefined && <span className="small text-muted">{receipt.bitcoinConfirmations} Bitcoin confirmations</span>}</div>
      <div className="activity-actions"><a className="text-link" href={`https://explorer.hiro.so/txid/${call.txid}?chain=${call.network}`} target="_blank" rel="noopener noreferrer">Explorer <Icon name="external" size={13} /></a><button className="icon-btn" disabled={isLoading} onClick={() => void refresh()} aria-label={`Refresh ${call.functionName} transaction`}><Icon name="refresh" size={14} /></button></div>
    </article>)}</div>}
  </section>;
}
