import { useEffect, useState } from "react";
import type { UserPosition } from "../../types/position.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { VAULT_VERSION } from "../../constants/contracts.js";
import { useWithdraw } from "../../hooks/useWithdraw.js";
import { useRequestWithdraw, useClaimWithdraw, useCancelWithdraw } from "../../hooks/useAsyncWithdraw.js";
import { useYields, MAX_YIELD_AGE_MS } from "../../hooks/useYields.js";
import { formatApy } from "../../lib/format.js";
import { formatSbtcAmount } from "../../lib/amount.js";
import { networkName } from "../../lib/stacksClient.js";
import { Icon } from "../shared/Icon.js";
import { useWallet } from "../../context/WalletContext.js";
import { WithdrawalReview, type ExitAction } from "./WithdrawalReview.js";

export function PositionCard({ position }: { position: UserPosition }) {
  const { address, isConnected } = useWallet();
  const meta = position.protocol ? PROTOCOLS[position.protocol] : null;
  const withdraw = useWithdraw();
  const request = useRequestWithdraw();
  const claim = useClaimWithdraw();
  const cancel = useCancelWithdraw();
  const { data: yields, isError: rateError } = useYields();
  const [review, setReview] = useState<{ action: ExitAction; address: string; position: UserPosition } | null>(null);
  useEffect(() => {
    if (review && (!isConnected || address !== review.address)) setReview(null);
  }, [address, isConnected, review]);
  const yieldData = yields?.find((y) => y.protocol === position.protocol);
  const fresh = !rateError && yieldData && !yieldData.apy_stale && Date.now() - yieldData.fetched_at <= MAX_YIELD_AGE_MS;
  const pending = position.isAsync && position.status === "pending";
  const mutations = { withdraw, request, claim, cancel };
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  const submitted = Object.values(mutations).find((mutation) => mutation.isSuccess)?.data;
  const error = Object.values(mutations).find((mutation) => mutation.isError)?.error;
  const openReview = (action: ExitAction) => {
    if (isConnected && address) setReview({ action, address, position: { ...position } });
  };
  const submit = (minPayoutSats?: bigint) => {
    if (!review || !isConnected || address !== review.address || busy) return;
    const needsQuote = VAULT_VERSION === "v7" && (review.action === "withdraw" || review.action === "claim");
    if (needsQuote && minPayoutSats === undefined) return;
    mutations[review.action].mutate({ adapter: review.position.adapter, ...(needsQuote ? { minPayoutSats } : {}) });
    setReview(null);
  };
  return <article className="position-card">
    <div className="position-top"><div className="strategy-identity"><span className="protocol-icon" aria-hidden="true">{meta?.abbr ?? "?"}</span><div><span className="protocol-name">{meta?.name ?? "Unknown adapter"}</span><span className={`status-label ${pending ? "warning" : "neutral"}`} style={{ marginTop: 7 }}>{pending ? "Redemption requested" : "Recorded position"}</span></div></div><div className="position-amount">{formatSbtcAmount(position.principalSats)} <small>sBTC</small><div className="caption">Recorded principal</div></div></div>
    <dl className="position-stats"><div><dt>Reported market APY</dt><dd>{fresh ? `${formatApy(yieldData.apy_percent)}%` : "Unavailable"}</dd></div><div><dt>Withdrawal method</dt><dd>{position.isAsync ? "Request, fund, claim" : "Atomic · if liquid"}</dd></div><div><dt>Position fee</dt><dd>{position.feeBps === undefined ? "See vault parameters" : `${(position.feeBps / 100).toFixed(2)}% of yield`}</dd></div></dl>
    {!meta && <p className="position-explainer">The adapter is not in this app’s protocol register. Verify the address below before any action.</p>}
    <p className="position-explainer contract-address">{position.adapter}</p>
    {pending && <p className="position-explainer">The underlying protocol must fund this request before it can be claimed. No completion time is guaranteed. Cancellation may only be possible while unfunded.</p>}
    {submitted && <div className="notice position-alert" role="status"><Icon name="info" size={17} /><div><strong>Transaction submitted.</strong> The displayed position updates after confirmation. <a href={`https://explorer.hiro.so/txid/${submitted}?chain=${networkName}`} target="_blank" rel="noopener noreferrer">Check transaction</a></div></div>}
    {!!error && <div className="notice error position-alert" role="alert"><Icon name="info" size={17} /><div>{error instanceof Error ? error.message : "The request could not be submitted."}</div></div>}
    <div className="position-actions">{busy ? <button className="btn primary" disabled>Waiting for wallet…</button> : !position.isAsync ? <button className="btn primary" disabled={!isConnected || !address} onClick={() => openReview("withdraw")}>Review withdrawal <Icon name="arrow" size={14} /></button> : !pending ? <button className="btn primary" disabled={!isConnected || !address} onClick={() => openReview("request")}>Request withdrawal</button> : <><button className="btn primary" disabled={!isConnected || !address} onClick={() => openReview("claim")}>Review claim</button><button className="btn ghost" disabled={!isConnected || !address} onClick={() => openReview("cancel")}>Cancel request</button></>}</div>
    {review && isConnected && address === review.address && <WithdrawalReview action={review.action} position={review.position} address={review.address} name={meta?.name ?? "the configured adapter"} onClose={() => setReview(null)} onConfirm={submit} />}
  </article>;
}
