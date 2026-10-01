import { useState } from "react";
import { MAX_YIELD_AGE_MS } from "../../hooks/useYields.js";
import type { NormalizedYield } from "../../types/yield.js";
import { PROTOCOLS, type ProtocolId } from "../../constants/protocols.js";
import { CONTRACTS, DEPOSITS_ENABLED, DEPOSIT_BLOCK_REASON, VAULT_VERSION } from "../../constants/contracts.js";
import { useDeposit } from "../../hooks/useDeposit.js";
import { useBalance } from "../../hooks/useBalance.js";
import { usePositions } from "../../hooks/usePositions.js";
import { useVaultStats } from "../../hooks/useVaultStats.js";
import { useDepositAdmission } from "../../hooks/useDepositAdmission.js";
import { formatApy } from "../../lib/format.js";
import { parseSbtcAmount, formatSbtcAmount } from "../../lib/amount.js";
import { networkName } from "../../lib/stacksClient.js";
import { Modal } from "../shared/Modal.js";
import { Icon } from "../shared/Icon.js";

export function DepositModal({ protocolId, data, onClose }: { protocolId: ProtocolId; data?: NormalizedYield; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState(false);
  const [reviewedMaxFeeBps, setReviewedMaxFeeBps] = useState<number | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const deposit = useDeposit();
  const balance = useBalance();
  const vault = useVaultStats();
  const positions = usePositions();
  const admission = useDepositAdmission(protocolId);
  const meta = PROTOCOLS[protocolId];
  const simulation = networkName === "testnet" && VAULT_VERSION === "v7";
  const currentPosition = positions.positions.find((position) => VAULT_VERSION === "v6" || position.adapter === CONTRACTS.ADAPTERS[protocolId]);
  const fresh = !!data && !data.apy_stale && Date.now() - data.fetched_at <= MAX_YIELD_AGE_MS;
  let amountSats: bigint | null = null;
  let amountError = "";
  if (amount) {
    try { amountSats = parseSbtcAmount(amount); } catch (error) { amountError = error instanceof Error ? error.message : "Enter a valid amount."; }
  }
  if (amountSats !== null && vault.data && amountSats < BigInt(vault.data.minDepositSats)) amountError = `Minimum deposit is ${formatSbtcAmount(BigInt(vault.data.minDepositSats))} sBTC.`;
  if (amountSats !== null && balance.data !== undefined && amountSats > balance.data) amountError = "This amount exceeds your verified balance.";
  if (amountSats !== null && vault.data && amountSats > BigInt(Math.max(0, vault.data.tvlCapSats - vault.data.totalDepositedSats))) amountError = "This amount exceeds the current vault capacity.";
  if (amountSats !== null && admission.data?.available && amountSats > admission.data.remainingSats) amountError = "This amount exceeds the adapter's remaining capacity.";
  const readError = balance.isError || vault.isError || positions.isError || admission.isError;
  const verifying = balance.isLoading || vault.isLoading || positions.isLoading || admission.isLoading || balance.data === undefined || !vault.data || !admission.data;
  const allowed = DEPOSITS_ENABLED && (simulation || (fresh && data?.is_live_integration === true));
  const canProceed = allowed && admission.data?.available === true && !currentPosition && !verifying && !readError && amountSats !== null && !amountError;
  const submit = () => {
    if (canProceed && acknowledged && amountSats !== null && reviewedMaxFeeBps !== null) deposit.mutate({ protocol: protocolId, amountSats, reviewedMaxFeeBps });
  };
  const description = simulation ? "Testnet simulation using mock assets and adapters. No real protocol yield is earned." : `Review the asset, terms, and destination for ${meta.name} on Stacks ${networkName}.`;
  return <Modal title={deposit.isSuccess ? "Transaction submitted" : deposit.isPending ? "Review in your wallet" : review ? "Review deposit" : `Deposit to ${meta.name}`} description={description} onClose={onClose}>
    {deposit.isSuccess ? <><div className="notice" role="status"><Icon name="info" /><div><strong>Submission is not confirmation.</strong> Check the transaction result before treating the position as active. Failed transactions do not create a deposit.</div></div><dl className="definition-list" style={{ marginTop: 20 }}><div><dt>Requested amount</dt><dd>{amount} {simulation ? "test sBTC" : "sBTC"}</dd></div><div><dt>Protocol route</dt><dd>{meta.name}{simulation ? " (mock)" : ""}</dd></div></dl>{deposit.data && <a className="text-link" style={{ marginTop: 20 }} href={`https://explorer.hiro.so/txid/${deposit.data}?chain=${networkName}`} target="_blank" rel="noopener noreferrer">Check transaction result <Icon name="external" size={13} /></a>}<div className="dialog-actions"><button className="btn primary" onClick={onClose}>Close</button></div></> : deposit.isPending ? <div className="state-panel" role="status"><span className="spinner" /><p>Confirm the network, asset, destination, and maximum amount in your wallet. You can reject the request there.</p></div> : !allowed ? <><div className="notice"><Icon name="shield" /><div><strong>Deposits are unavailable.</strong> {!DEPOSITS_ENABLED ? DEPOSIT_BLOCK_REASON : "A fresh, enabled integration could not be verified."}</div></div><p className="form-hint">{meta.blurb}</p><div className="dialog-actions"><button className="btn ghost" onClick={onClose}>Close</button></div></> : currentPosition ? <><div className="notice"><Icon name="info" /><div><strong>A position already exists.</strong> This vault permits one position per adapter. Review and withdraw the existing position before depositing again.</div></div><div className="dialog-actions"><button className="btn ghost" onClick={onClose}>Close</button></div></> : <>
      {readError && <div className="notice error" role="alert"><Icon name="info" /><div><strong>Account or vault data could not be verified.</strong> Depositing is blocked until the reads succeed. <button className="text-link" style={{ background: "none", padding: 0, border: 0 }} onClick={() => { void balance.refetch(); void vault.refetch(); void positions.refetch(); void admission.refetch(); }}>Retry</button></div></div>}
      {admission.data && !admission.data.available && <div className="notice" role="status"><Icon name="info" /><div>{admission.data.reason}</div></div>}
      {review ? <><dl className="definition-list"><div><dt>Amount</dt><dd>{amountSats === null ? "Invalid amount" : formatSbtcAmount(amountSats)} {simulation ? "test sBTC" : "sBTC"}</dd></div><div><dt>Route</dt><dd>{meta.name}{simulation ? " (mock adapter)" : ""}</dd></div><div><dt>Network</dt><dd>{networkName}</dd></div><div><dt>Performance fee</dt><dd>{reviewedMaxFeeBps !== null ? `${(reviewedMaxFeeBps / 100).toFixed(2)}% of yield (maximum)` : "Unavailable"}</dd></div><div><dt>Share quote tolerance</dt><dd>0.5%</dd></div><div><dt>Withdrawal</dt><dd>{meta.async ? "Request, fund, then claim" : "Dependent on liquidity"}</dd></div><div><dt>Vault</dt><dd className="contract-address">{CONTRACTS.VAULT}</dd></div></dl><label className="risk-check"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />{simulation ? "I understand these are mock testnet assets; this transaction does not verify a real protocol integration or earn real yield." : "I understand principal can be lost, rates can change, and withdrawal depends on the underlying protocol. I have checked the destination contract."}</label></> : <><label className="form-label" htmlFor="deposit-amount"><span id="deposit-amount-label">Deposit amount</span><span className="text-muted small">{balance.isError ? "Balance unavailable" : balance.data === undefined ? "Checking balance…" : `${formatSbtcAmount(balance.data)} available`}</span></label><div className="amount-input"><input id="deposit-amount" aria-labelledby="deposit-amount-label" aria-describedby={amountError ? "amount-error" : "amount-hint"} aria-invalid={!!amountError} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" maxLength={48} value={amount} onChange={(e) => setAmount(e.target.value)} /><span>{simulation ? "test sBTC" : "sBTC"}</span><button disabled={balance.data === undefined || balance.isError || balance.data === 0n} onClick={() => { if (balance.data !== undefined) setAmount(formatSbtcAmount(balance.data)); }}>MAX</button></div>{amountError && <p id="amount-error" className="form-error" role="alert">{amountError}</p>}<p id="amount-hint" className="form-hint">Use up to 8 decimal places. {vault.data ? `Minimum ${formatSbtcAmount(BigInt(vault.data.minDepositSats))} sBTC.` : "Verifying the vault minimum…"}</p><dl className="definition-list" style={{ marginTop: 24 }}><div><dt>{simulation ? "Yield" : "Reported market APY"}</dt><dd>{simulation ? "Simulation only" : fresh && data ? `${formatApy(data.apy_percent)}% · variable` : "Unavailable"}</dd></div><div><dt>Withdrawal model</dt><dd>{meta.async ? "Request & claim" : "Liquidity dependent"}</dd></div><div><dt>Asset</dt><dd>{simulation ? "Mock sBTC on testnet" : "sBTC on Stacks"}</dd></div></dl></>}
      {deposit.isError && <div className="notice error" style={{ marginTop: 20 }} role="alert"><Icon name="info" size={17} /><div>{deposit.error instanceof Error ? deposit.error.message : "Transaction could not be submitted."}</div></div>}
      <div className="dialog-actions"><button className="btn ghost" onClick={() => review ? setReview(false) : onClose()}>{review ? "Back" : "Cancel"}</button><button className="btn primary" disabled={!canProceed || (review && !acknowledged)} onClick={() => { if (review) submit(); else if (vault.data) { setReviewedMaxFeeBps(vault.data.feeBasisPoints); setAcknowledged(false); setReview(true); } }}>{verifying ? "Verifying…" : review ? "Review in wallet" : "Review deposit"}</button></div>
    </>}
  </Modal>;
}
