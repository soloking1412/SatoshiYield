import { networks, payments, Transaction, initEccLib } from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { SIGNET_GENESIS, type BabylonContext, type BabylonStakeRequest } from '../src/types.js';
initEccLib(ecc);
/** Public, deterministic unit-test keys only. Never funded or used as a real wallet. */
export const dummyKey = (n:number) => Buffer.from(n.toString(16).padStart(64,'0'),'hex');
export const pubkey = (n:number) => Buffer.from(ecc.pointFromScalar(dummyKey(n),true)!);
export const xkey = (n:number) => pubkey(n).subarray(1).toString('hex');
export const wallet = {network:'signet' as const,genesisHash:SIGNET_GENESIS,address:payments.p2wpkh({pubkey:pubkey(1),network:networks.testnet}).address!,publicKeyHex:pubkey(1).toString('hex')};
export function fixture(valueSat=200_000,stakeSats=100_000): BabylonStakeRequest {
  const output = payments.p2wpkh({pubkey:pubkey(1),network:networks.testnet}).output!;
  const tx=new Transaction(); tx.addInput(Buffer.alloc(32,42),0);tx.addOutput(output,valueSat);
  const context: BabylonContext = {network:'signet',genesisHash:SIGNET_GENESIS,babylonChainId:'bbn-test-6',bitcoinTipHeight:500_000,babylonBitcoinTipHeight:500_000,fetchedAtMs:Date.now(),parameterSource:'https://staking-api.testnet.babylonlabs.io/v2/network-info',minimumStakingConfirmations:30,finalityProviders:[{publicKey:xkey(5),name:'Synthetic test provider',status:'active',commission:'0.05'}],parameters:[{version:6,btcActivationHeight:273725,covenantNoCoordPks:[xkey(2),xkey(3),xkey(4)],covenantQuorum:2,minStakingAmountSat:50_000,maxStakingAmountSat:35_000_000_000,minStakingTimeBlocks:10_000,maxStakingTimeBlocks:64_000,unbondingTime:301,unbondingFeeSat:2000,slashing:{slashingPkScriptHex:payments.p2wpkh({pubkey:pubkey(9),network:networks.testnet}).output!.toString('hex'),slashingRate:0.05,minSlashingTxFeeSat:9000}}]};
  return {wallet:{...wallet},context,finalityProviderPublicKey:xkey(5),stakingSats:stakeSats,stakingBlocks:10_000,feeRateSatVb:2,maxFeeSats:5_000,utxos:[{txid:tx.getId(),vout:0,valueSat,scriptPubKey:output.toString('hex'),rawTransactionHex:tx.toHex(),confirmedHeight:480_000}]};
}
