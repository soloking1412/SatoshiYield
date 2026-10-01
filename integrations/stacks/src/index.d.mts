import type { ClarityValue, PostCondition, PostConditionMode } from '@stacks/transactions';
export type ProtocolId = 'zest-sbtc' | 'stackingdao-stbtc';
export interface Observation {
 readonly protocol: ProtocolId; readonly owner: string; readonly network: 'mainnet'; readonly chainId: 1;
 readonly observedAt: number; readonly tip: string; readonly stacksHeight: number; readonly burnHeight: number;
 readonly assetBalance: bigint; readonly receiptBalance: bigint; readonly queueGuard: string | null;
 readonly sources: ReadonlyArray<{contract:string;sha256:string}>;
 readonly allowance: {required:false;type:'none';reason:string};
 readonly cooldown?: bigint; readonly idleFee?: bigint; readonly withdrawFee?: bigint;
 readonly [field: string]: unknown;
}
export interface Quote {
 readonly protocol: ProtocolId; readonly action: 'deposit'|'redeem'|'request'|'claim'; readonly owner: string;
 readonly amount: bigint; readonly expectedOut: bigint; readonly minimumOut: bigint; readonly fee: bigint;
 readonly observedAt: number; readonly expiresAt: number; readonly tip:string; readonly chainId:1; readonly network:'mainnet';
 readonly executable:boolean; readonly reason:string|null; readonly state:Observation;
 readonly maxCooldownBurnBlocks?:bigint; readonly claimId?:bigint; readonly unlockBurnHeight?:bigint; readonly maxFeeBps?:bigint;
}
export interface UnsignedRoute {
 readonly protocol:ProtocolId; readonly action:Quote['action']; readonly receiptOwner:string; readonly custody:'receipt-direct-to-wallet';
 readonly minimumOut:bigint; readonly expiresAt:number; readonly tip:string; readonly chainId:1; readonly network:'mainnet'; readonly approvalRequired:false;
 readonly rules:ReadonlyArray<Record<string,unknown>>;
 readonly transaction:{contractAddress:string;contractName:string;functionName:string;functionArgs:ClarityValue[];postConditionMode:PostConditionMode;postConditions:PostCondition[];network:'mainnet'};
 readonly review:{input:bigint;output:bigint;minimum:bigint;fee:bigint;feeAsset:'sBTC';networkFeeIncluded:false;sourcePins:Observation['sources']};
}
export interface StacksIntegrationClient {
 readState(protocol:ProtocolId,owner:string):Promise<Observation>;
 readClaimState(owner:string):Promise<Observation>;
 quote(state:Observation,action:'deposit'|'redeem'|'request',amount:bigint|string,options?:{slippageBps?:number}):Promise<Quote>;
 readClaim(state:Observation,id:bigint|string):Promise<Quote>;
 buildUnsignedRoute(quote:Quote,wallet:{walletAddress:string;network:string}):UnsignedRoute;
}
export const CONTRACTS:Readonly<Record<'sbtc'|'sbtcRegistry'|'zest'|'zestRegistry'|'stackingCore'|'stbtc'|'reserve'|'ratio'|'dao'|'rewards'|'withdrawals'|'nft'|'ststxbtc'|'ststxbtcV2',string>>;
export const PROTOCOLS:Readonly<Record<ProtocolId,{name:string;asset:string;receipt:string;contract:string;receiptContract:string;receiptAssetName:string;custody:string;chainId:1;network:'mainnet';testnet:null}>>;
export const QUOTE_TTL_MS:number;
export const MAINNET_CHAIN_ID:1;
export const MAX_UINT128:bigint;
export function createStacksIntegrationClient(options?:{fetch?:typeof fetch;now?:()=>number;endpoint?:string;queueGuard?:string|null}):StacksIntegrationClient;
export function uint(value:bigint|string,name?:string,allowZero?:boolean):bigint;
export function walletPrincipal(value:string):string;
export function minimumOutput(expected:bigint,slippageBps?:number):bigint;
export function decode(value:ClarityValue):unknown;
export function assertEventPolicy(route:UnsignedRoute,events:unknown[]):true;
