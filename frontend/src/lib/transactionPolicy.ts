import { Pc, contractPrincipalCV, standardPrincipalCV, uintCV, type ClarityValue } from "@stacks/transactions";
import { CONTRACTS, DEPOSITS_ENABLED, DEPOSIT_BLOCK_REASON, SBTC_ASSET_NAME, VAULT_VERSION } from "../constants/contracts.js";
import { PROTOCOLS, type ProtocolId } from "../constants/protocols.js";
import { MAX_UINT128 } from "./amount.js";
import { readContract, requireUint } from "./chainRead.js";
import { fetchPositions } from "../hooks/usePositions.js";
import { fetchDepositAdmission } from "./depositAdmission.js";
import type { UserPosition } from "../types/position.js";
export const SLIPPAGE_BPS = 50n;
export function contractPrincipal(contract: string) {
  const parts = contract.split(".");
  if(parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid contract identifier");
  return contractPrincipalCV(parts[0],parts[1]);
}
const asset = () => CONTRACTS.SBTC_TOKEN as `${string}.${string}`;
export function senderProtections(address:string) {
  return [Pc.principal(address).willSendEq(0).ft(asset(),SBTC_ASSET_NAME),Pc.principal(address).willSendEq(0).ustx()];
}
export interface WithdrawalQuote { grossSats: bigint; payoutSats: bigint; minimumSats: bigint; feeBps: number }
async function quotePosition(address: string, position: UserPosition): Promise<WithdrawalQuote> {
  const grossSats = requireUint(await readContract(position.adapter,"preview-withdraw",[standardPrincipalCV(address)],address));
  if (position.feeBps === undefined || !Number.isSafeInteger(position.feeBps) || position.feeBps < 0 || position.feeBps > 1000) throw new Error("Position fee is unavailable");
  const profit = grossSats > position.principalSats ? grossSats-position.principalSats : 0n;
  const payoutSats = grossSats-profit*BigInt(position.feeBps)/10000n;
  return {grossSats,payoutSats,minimumSats:(payoutSats*(10000n-SLIPPAGE_BPS)+9999n)/10000n,feeBps:position.feeBps};
}
export async function getWithdrawalQuote(address: string, adapter: string): Promise<WithdrawalQuote> {
  if (VAULT_VERSION !== "v7") throw new Error("Legacy withdrawals have no enforceable minimum payout quote");
  const position = (await fetchPositions(address)).find(p=>p.adapter===adapter);
  if (!position) throw new Error("No position exists in this adapter for your wallet");
  return quotePosition(address,position);
}
export async function depositOptions(address:string, protocol:ProtocolId, amount:bigint, reviewedMaxFeeBps:number) {
  if(!DEPOSITS_ENABLED) throw new Error(DEPOSIT_BLOCK_REASON);
  if(!Object.hasOwn(PROTOCOLS,protocol)) throw new Error("Unknown integration");
  if(amount < 1000n || amount > MAX_UINT128) throw new Error("Deposit amount is outside the allowed range");
  if (!Number.isSafeInteger(reviewedMaxFeeBps) || reviewedMaxFeeBps < 0 || reviewedMaxFeeBps > 1000) throw new Error("Review the performance fee before depositing");
  const adapter = CONTRACTS.ADAPTERS[protocol];
  // This release exercises token-moving test fixtures only; production routes require separate verification.
  if(!adapter.endsWith(".mock-sync-v7") && !adapter.endsWith(".mock-async-v7")) throw new Error("This adapter is not enabled for testnet validation");
  const admission = await fetchDepositAdmission(protocol);
  if (!admission.available) throw new Error(admission.reason);
  if (amount > admission.remainingSats) throw new Error("Amount exceeds the remaining adapter capacity");
  const [preview, fee] = await Promise.all([
    readContract(adapter,"preview-deposit",[uintCV(amount)],address).then(requireUint),
    readContract(CONTRACTS.VAULT,"get-fee-basis-points",[],address).then(requireUint),
  ]);
  const minimum = preview * (10000n - SLIPPAGE_BPS) / 10000n;
  if(fee > BigInt(reviewedMaxFeeBps)) throw new Error("The fee increased since your review. Review the deposit again.");
  if(minimum === 0n || fee > 1000n) throw new Error("Invalid deposit quote");
  const [contractAddress,contractName] = CONTRACTS.VAULT.split(".");
  return {contractAddress:contractAddress!,contractName:contractName!,functionName:PROTOCOLS[protocol].async?"deposit-async":"deposit",
    functionArgs:[contractPrincipal(CONTRACTS.SBTC_TOKEN),contractPrincipal(adapter),uintCV(amount),uintCV(minimum),uintCV(reviewedMaxFeeBps)],
    postConditionMode:"deny" as const,
    postConditions:[Pc.principal(address).willSendEq(amount).ft(asset(),SBTC_ASSET_NAME),Pc.principal(address).willSendEq(0).ustx()],
  };
}
export async function withdrawalOptions(address:string, adapter:string, action:"withdraw"|"request-withdraw"|"claim-withdraw"|"cancel-withdraw", minimum?:bigint) {
  // Re-read the position: untrusted UI/API input cannot choose another adapter.
  const position = (await fetchPositions(address)).find(p=>p.adapter===adapter);
  if(!position) throw new Error("No position exists in this adapter for your wallet");
  if((action === "withdraw") === position.isAsync) throw new Error("Incorrect withdrawal route");
  const pays = action === "withdraw" || action === "claim-withdraw";
  const functionArgs:ClarityValue[] = pays ? [contractPrincipal(CONTRACTS.SBTC_TOKEN),contractPrincipal(adapter)] : [contractPrincipal(adapter)];
  const postConditions = senderProtections(address);
  if(pays && VAULT_VERSION === "v7") {
    const quote = await quotePosition(address,position);
    const gross = quote.grossSats;
    const minPayout = minimum ?? quote.minimumSats;
    if(minPayout < 0n || minPayout > MAX_UINT128 || (quote.payoutSats===0n && minimum!==0n)) throw new Error("Zero recovery requires explicit acceptance; do not automatically discard the position");
    if (minPayout > quote.payoutSats) throw new Error("The redemption quote fell below your reviewed minimum. Review the withdrawal again.");
    functionArgs.push(uintCV(minPayout));
    // Test fixtures transfer sBTC adapter -> vault -> user. No broad Allow mode.
    postConditions.push(Pc.principal(adapter).willSendLte(gross).ft(asset(),SBTC_ASSET_NAME));
    postConditions.push(Pc.principal(CONTRACTS.VAULT).willSendLte(gross).ft(asset(),SBTC_ASSET_NAME));
  }
  const [contractAddress,contractName] = CONTRACTS.VAULT.split(".");
  return {contractAddress:contractAddress!,contractName:contractName!,functionName:action,functionArgs,postConditions,
    // Legacy external protocols have share-token transfers we cannot enumerate from
    // this ABI. Allow is explicit and scoped to existing-position exits only.
    postConditionMode:VAULT_VERSION === "v6" ? "allow" as const : "deny" as const,
  };
}
