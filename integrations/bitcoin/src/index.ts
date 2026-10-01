export * from './types.js';
export { parseBtcAmount, satsToBtc } from './validation.js';
export { fetchBabylonSignetContext, fetchSignetUtxos, parseBabylonParameters } from './discovery.js';
export { buildBabylonStakePlan, buildBabylonRecoveryPlan, validateReturnedStakePsbt, verifyBabylonPlan } from './babylon.js';
export { prepareLombardStake, validateLombardFeeAuthorization, LOMBARD_SEPOLIA_LBTC, LOMBARD_SEPOLIA_CATALOG_LBTC } from './lombard.js';
export type { LombardStakeSession } from './lombard.js';
export function getBitcoinCapabilities() {
  return [
    {protocol:'babylon',network:'signet',mode:'unsigned-plan',wallets:['bitcoin','babylon'],broadcastEnabled:false,custody:'native-bitcoin-script',nextGate:'Babylon pre-staking registration, covenant verification and Bitcoin confirmation lifecycle',officialUrl:'https://btcstaking.testnet.babylonlabs.io'},
    {protocol:'lombard',network:'signet-sepolia',mode:'sdk-quote-and-address-authorization',wallets:['bitcoin','evm'],broadcastEnabled:false,custody:'lombard-consortium',nextGate:'User-controlled Signet funding, issuance and complete redemption evidence',officialUrl:'https://docs.lombard.finance/build/sdk/start-here/testing-and-sandbox'},
    {protocol:'solv',network:'external',mode:'verified-handoff',wallets:['bitcoin','destination-chain'],broadcastEnabled:false,custody:'solv-threshold-custody',nextGate:'Official partner enrollment and supported public testnet deposit/redemption route',officialUrl:'https://docs.solv.finance/solvbtc-technical-architecture/bitcoin-mainnet-architecture'},
    {protocol:'stacks-native-btc',network:'bitcoin-stacks',mode:'verified-handoff',wallets:['bitcoin','stacks'],broadcastEnabled:false,custody:'direct-timelock-or-pooled-sbtc',nextGate:'Current PoX-5 direct access and BTC/STX bonding transaction specification',officialUrl:'https://www.stacks.co/blog/genesis-bond-14-day-recap'},
  ] as const;
}
/** No address, transaction URI or amount is passed to a third party. */
export function getExternalProtocolHandoff(protocol: 'solv' | 'stacks-native-btc') {
  const route = getBitcoinCapabilities().find(c => c.protocol === protocol);
  if(!route || route.mode !== 'verified-handoff') throw new Error('Unsupported external protocol');
  return {...route,external:true as const,depositAddress:null,isSatoshiVault:false as const};
}
