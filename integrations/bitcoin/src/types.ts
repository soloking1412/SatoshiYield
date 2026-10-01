/** All monetary values are integer satoshis. This package never broadcasts. */
export const SIGNET_GENESIS = '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6' as const;
export const MAX_CONTEXT_AGE_MS = 120_000;
export type BitcoinNetwork = 'signet';
export interface BitcoinWalletBinding {
  network: BitcoinNetwork;
  genesisHash: string;
  address: string;
  /** Compressed secp256k1 public key. Required to bind the address to the staking key. */
  publicKeyHex: string;
}
export interface VerifiedUtxo {
  txid: string;
  vout: number;
  valueSat: number;
  scriptPubKey: string;
  rawTransactionHex: string;
  confirmedHeight: number;
}
export interface BabylonParameters {
  version: number;
  btcActivationHeight: number;
  covenantNoCoordPks: string[];
  covenantQuorum: number;
  unbondingTime: number;
  unbondingFeeSat: number;
  maxStakingAmountSat: number;
  minStakingAmountSat: number;
  maxStakingTimeBlocks: number;
  minStakingTimeBlocks: number;
  slashing: { slashingPkScriptHex: string; slashingRate: number; minSlashingTxFeeSat: number };
}
export interface FinalityProvider {
  publicKey: string;
  name: string;
  status: 'active' | 'inactive';
  commission: string;
}
export interface BabylonContext {
  network: BitcoinNetwork;
  genesisHash: string;
  babylonChainId: 'bbn-test-6';
  bitcoinTipHeight: number;
  babylonBitcoinTipHeight: number;
  fetchedAtMs: number;
  parameterSource: string;
  parameters: BabylonParameters[];
  finalityProviders: FinalityProvider[];
  minimumStakingConfirmations: number;
}
export interface BabylonStakeRequest {
  wallet: BitcoinWalletBinding;
  context: BabylonContext;
  finalityProviderPublicKey: string;
  stakingSats: number;
  stakingBlocks: number;
  feeRateSatVb: number;
  maxFeeSats: number;
  utxos: VerifiedUtxo[];
}
export interface BabylonStakePlan {
  protocol: 'babylon';
  network: 'signet';
  kind: 'stake';
  wallet: BitcoinWalletBinding;
  unsignedTxHex: string;
  psbtBase64: string;
  stakingTxId: string;
  stakingOutputIndex: number;
  stakingOutputScript: string;
  stakingSats: number;
  stakingBlocks: number;
  finalityProviderPublicKey: string;
  finalityProviderCommission: string;
  parameters: BabylonParameters;
  feeSats: number;
  maxFeeSats: number;
  inputValueSats: number;
  expiresAtMs: number;
  reviewDigest: string;
  broadcastAllowed: false;
  nextStep: 'babylon-pre-staking-registration';
  recovery: { earlyUnbondingBlocks: number; earlyUnbondingFeeSats: number; slashFraction: number; requiresCovenantQuorum: number };
}
export interface BitcoinRecoveryPlan {
  protocol: 'babylon';
  network: 'signet';
  kind: 'early-unbond' | 'withdraw-expired';
  psbtBase64: string;
  unsignedTxHex: string;
  feeSats: number;
  payoutSats: number;
  reviewDigest: string;
  expiresAtMs: number;
  broadcastAllowed: false;
  requirements: string[];
}
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
}
export interface LombardStakeRequest {
  amountBtc: string;
  recipient: string;
  expectedChainId: 11155111;
}
export interface LombardQuote {
  protocol: 'lombard';
  environment: 'testnet';
  partnerId: 'test';
  sourceNetwork: 'signet';
  destinationChainId: 11155111;
  recipient: string;
  amountBtc: string;
  amountSats: number;
  token: 'LBTC';
  tokenAddress: string;
  catalogTokenAddress: string;
  deploymentSource: 'sdk-transaction-resolver';
  tokenDecimals: 8;
  /** Upper bound explicitly reviewed before EIP-712 authorization. */
  mintingFeeBtc: string;
  estimatedLbtc: string;
  expiresAtMs: number;
  reviewDigest: string;
  custody: 'lombard-consortium';
  minimumOutputEnforced: false;
  authorizationReady: boolean;
  authorizationBlockReason: string | null;
}
export interface LombardDepositInstruction {
  quote: LombardQuote;
  depositAddress: string;
  sourceNetwork: 'signet';
  verifiedAtMs: number;
  broadcastAllowed: false;
  recovery: 'Lombard redemption to BTC requires LBTC, destination gas, protocol liquidity, and consortium settlement.';
}
