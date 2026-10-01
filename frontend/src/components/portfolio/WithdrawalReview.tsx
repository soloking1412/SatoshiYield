import { useEffect, useState } from "react";
import { VAULT_VERSION } from "../../constants/contracts.js";
import { useWallet } from "../../context/WalletContext.js";
import { formatSbtcAmount } from "../../lib/amount.js";
import { networkName } from "../../lib/stacksClient.js";
import { getWithdrawalQuote, type WithdrawalQuote } from "../../lib/transactionPolicy.js";
import type { UserPosition } from "../../types/position.js";
import { Icon } from "../shared/Icon.js";
import { Modal } from "../shared/Modal.js";

export type ExitAction = "withdraw" | "request" | "claim" | "cancel";
type QuoteState = { status: "loading" } | { status: "ready"; value: WithdrawalQuote } | { status: "error"; message: string };
const labels: Record<ExitAction, string> = { withdraw: "Withdraw position", request: "Request withdrawal", claim: "Claim redemption", cancel: "Cancel request" };

export function WithdrawalReview({ action, position, address, name, onClose, onConfirm }: {
  action: ExitAction; position: UserPosition; address: string; name: string;
  onClose: () => void; onConfirm: (minimumSats?: bigint) => void;
}) {
  const wallet = useWallet();
  const needsQuote = VAULT_VERSION === "v7" && (action === "withdraw" || action === "claim");
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const sameWallet = wallet.isConnected && wallet.address === address;

  // One quote per review. Only an explicit retry replaces it; focus/refetches
  // must not silently change the minimum the user is being asked to accept.
  useEffect(() => {
    if (!needsQuote) return;
    let cancelled = false;
    setQuoteState({ status: "loading" });
    setAcknowledged(false);
    void getWithdrawalQuote(address, position.adapter).then(
      value => { if (!cancelled) setQuoteState({ status: "ready", value }); },
      error => { if (!cancelled) setQuoteState({ status: "error", message: error instanceof Error ? error.message : "The redemption quote could not be read." }); },
    );
    return () => { cancelled = true; };
  }, [needsQuote, address, position.adapter, attempt]);

  const quote = quoteState.status === "ready" ? quoteState.value : undefined;
  const zeroRecovery = needsQuote && quote?.payoutSats === 0n;
  const hasLoss = needsQuote && quote !== undefined && quote.payoutSats < position.principalSats;
  const requiresAcknowledgement = zeroRecovery || hasLoss;
  const canConfirm = sameWallet && (!needsQuote || (quote !== undefined && (!requiresAcknowledgement || acknowledged)));
  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(needsQuote ? quote!.minimumSats : undefined);
  };

  return <Modal title={labels[action]} description={`Review the action for ${name} on Stacks ${networkName}.`} onClose={onClose}>
    <dl className="definition-list">
      <div><dt>Wallet</dt><dd className="contract-address">{address}</dd></div>
      <div><dt>Recorded principal</dt><dd>{formatSbtcAmount(position.principalSats)} sBTC</dd></div>
      <div><dt>Adapter</dt><dd className="contract-address">{position.adapter}</dd></div>
      <div><dt>Contract version</dt><dd>{VAULT_VERSION}</dd></div>
    </dl>
    {!sameWallet && <div className="notice error" role="alert" style={{ marginTop: 20 }}><Icon name="info" /><div>Your wallet changed. Close this review and start again with the selected wallet.</div></div>}
    {needsQuote && quoteState.status === "loading" && <div className="notice" role="status" style={{ marginTop: 20 }}><span className="spinner" /><div>Reading the current redemption quote…</div></div>}
    {needsQuote && quoteState.status === "error" && <div className="notice error" role="alert" style={{ marginTop: 20 }}><Icon name="info" /><div><strong>Redemption quote unavailable.</strong> {quoteState.message} No payout has been assumed. <button className="text-link" style={{ border: 0, background: "none", padding: 0 }} disabled={!sameWallet} onClick={() => setAttempt(value => value + 1)}>Retry quote</button></div></div>}
    {needsQuote && quote && <>
      <dl className="definition-list" style={{ marginTop: 20 }}>
        <div><dt>Estimated net payout</dt><dd>{formatSbtcAmount(quote.payoutSats)} sBTC</dd></div>
        <div><dt>On-chain minimum payout</dt><dd>{formatSbtcAmount(quote.minimumSats)} sBTC</dd></div>
        <div><dt>Position performance fee</dt><dd>{(quote.feeBps / 100).toFixed(2)}% of yield</dd></div>
      </dl>
      <p className="form-hint">The minimum allows up to 0.5% below this net quote, rounded up to a whole satoshi. This review keeps that minimum fixed. A lower payout makes the transaction fail; network fees may still apply.</p>
      {requiresAcknowledgement && <label className="risk-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{zeroRecovery ? "I accept a zero sBTC payout and permanently close this position without recovering any principal." : "The estimated payout is below my recorded principal. I accept this loss and the minimum payout shown."}</label>}
    </>}
    {(action === "cancel" || action === "request") && <div className="notice" style={{ marginTop: 20 }}><Icon name="info" size={17} /><div>{action === "cancel" ? "Cancellation is subject to the contract state. Review the wallet prompt; a submitted request is not confirmed until included on-chain." : "Requesting a withdrawal starts a delayed redemption. Your capital remains exposed while the request is pending and funding is not guaranteed."}</div></div>}
    {VAULT_VERSION === "v6" && <div className="notice" style={{ marginTop: 20 }}><Icon name="info" size={17} /><div>This legacy vault does not support a minimum payout parameter. Wallet guards require zero outgoing sBTC and STX, excluding network fees. Compatibility with external protocols leaves other asset movements unconstrained. Inspect every asset permission in the wallet before signing.</div></div>}
    <div className="dialog-actions"><button className="btn ghost" onClick={onClose}>Back</button><button className="btn primary" disabled={!canConfirm} onClick={confirm}>Review in wallet</button></div>
  </Modal>;
}
