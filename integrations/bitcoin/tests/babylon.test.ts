import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { Psbt, Transaction, networks, payments } from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { buildBabylonRecoveryPlan,buildBabylonStakePlan,validateReturnedStakePsbt,verifyBabylonPlan } from '../src/babylon.js';
import { fixture,dummyKey,pubkey,wallet,xkey } from './fixtures.js';

describe('official Babylon SDK unsigned transaction boundary',()=>{
  it('builds exact native staking and change, independently checks fee and verifies safe wallet signature',async()=>{
    const request=fixture();const plan=await buildBabylonStakePlan(request);
    const tx=Transaction.fromHex(plan.unsignedTxHex);
    expect(tx.outs[plan.stakingOutputIndex]?.value).toBe(100_000);
    expect(plan.feeSats).toBe(plan.inputValueSats-tx.outs.reduce((n,o)=>n+o.value,0));
    expect(plan.broadcastAllowed).toBe(false);expect(plan.nextStep).toBe('babylon-pre-staking-registration');
    expect(plan.recovery).toMatchObject({earlyUnbondingBlocks:301,slashFraction:0.05});
    const psbt=Psbt.fromBase64(plan.psbtBase64,{network:networks.testnet});
    psbt.signAllInputs({publicKey:pubkey(1),sign:(hash)=>Buffer.from(ecc.sign(hash,dummyKey(1)))});
    await expect(validateReturnedStakePsbt(plan,psbt.toBase64(),wallet)).resolves.toBeUndefined();
  });
  it('binds Taproot funding address to the same staking key',async()=>{
    const req=fixture();req.wallet.address=payments.p2tr({internalPubkey:pubkey(1).subarray(1),network:networks.testnet}).address!;
    const tx=new Transaction();tx.addInput(Buffer.alloc(32,43),0);const script=payments.p2tr({internalPubkey:pubkey(1).subarray(1),network:networks.testnet}).output!;tx.addOutput(script,200_000);
    req.utxos=[{...req.utxos[0]!,txid:tx.getId(),scriptPubKey:script.toString('hex'),rawTransactionHex:tx.toHex()}];
    await expect(buildBabylonStakePlan(req)).resolves.toMatchObject({wallet:req.wallet});
  });
  it.each([
    ['mainnet wallet',(r:any)=>{r.wallet.network='mainnet'}],
    ['testnet masquerading as Signet',(r:any)=>{r.wallet.genesisHash='0'.repeat(64)}],
    ['different key',(r:any)=>{r.wallet.publicKeyHex=pubkey(9).toString('hex')}],
    ['wrong Babylon chain',(r:any)=>{r.context.babylonChainId='bbn-1'}],
    ['stale params',(r:any)=>{r.context.fetchedAtMs-=120_001}],
    ['future params',(r:any)=>{r.context.fetchedAtMs+=10_000}],
    ['light client lag',(r:any)=>{r.context.babylonBitcoinTipHeight-=145}],
    ['jailed provider',(r:any)=>{r.context.finalityProviders[0].status='inactive'}],
    ['provider key collision',(r:any)=>{r.context.finalityProviders[0].publicKey=xkey(1);r.finalityProviderPublicKey=xkey(1)}],
    ['duplicate funding',(r:any)=>{r.utxos.push(r.utxos[0])}],
    ['inflated UTXO',(r:any)=>{r.utxos[0].valueSat++}],
    ['foreign UTXO script',(r:any)=>{r.utxos[0].scriptPubKey='00'}],
    ['wrong UTXO ID',(r:any)=>{r.utxos[0].txid='0'.repeat(64)}],
    ['unconfirmed funding',(r:any)=>{r.utxos[0].confirmedHeight=0}],
    ['fee cap',(r:any)=>{r.maxFeeSats=1}],
    ['fractional satoshis',(r:any)=>{r.stakingSats=50_000.1}],
    ['timelock outside params',(r:any)=>{r.stakingBlocks=1}],
  ])('rejects %s',async(_label,change)=>{const r=fixture();change(r);await expect(buildBabylonStakePlan(r)).rejects.toThrow()});
  it('does not accept a substituted reviewed plan, wallet or expired review',async()=>{
    const plan=await buildBabylonStakePlan(fixture());
    await expect(verifyBabylonPlan({...plan,stakingSats:1})).rejects.toThrow('modified');
    await expect(validateReturnedStakePsbt(plan,plan.psbtBase64,{...wallet,address:'other'})).rejects.toThrow('Wallet changed');
    await expect(verifyBabylonPlan(plan,plan.expiresAtMs)).rejects.toThrow('expired');
  });
  it('rejects wallet-added outputs, altered input values and unsafe signature modes',async()=>{
    const plan=await buildBabylonStakePlan(fixture());
    const extra=Psbt.fromBase64(plan.psbtBase64,{network:networks.testnet});extra.addOutput({address:wallet.address,value:1});
    await expect(validateReturnedStakePsbt(plan,extra.toBase64(),wallet)).rejects.toThrow('changed transaction');
    const inflated=Psbt.fromBase64(plan.psbtBase64,{network:networks.testnet});inflated.data.inputs[0]!.witnessUtxo!.value++;
    await expect(validateReturnedStakePsbt(plan,inflated.toBase64(),wallet)).rejects.toThrow('funding value');
    const unsafe=Psbt.fromBase64(plan.psbtBase64,{network:networks.testnet});unsafe.updateInput(0,{sighashType:Transaction.SIGHASH_NONE});
    await expect(validateReturnedStakePsbt(plan,unsafe.toBase64(),wallet)).rejects.toThrow('Unsafe');
    await expect(validateReturnedStakePsbt(plan,plan.psbtBase64,wallet)).rejects.toThrow('No signatures');
  });
  it('creates real SDK recovery PSBTs, keeps covenant gate explicit and rejects premature withdrawal',async()=>{
    const req=fixture();const plan=await buildBabylonStakePlan(req);
    const unbond=await buildBabylonRecoveryPlan(plan,req.context,'early-unbond',499_000,2,5_000);
    expect(unbond.feeSats).toBe(2_000);expect(unbond.payoutSats).toBe(98_000);expect(unbond.requirements.join()).toContain('covenant');
    await expect(buildBabylonRecoveryPlan(plan,req.context,'withdraw-expired',499_000,2,5_000)).rejects.toThrow('not matured');
    const mature=await buildBabylonRecoveryPlan(plan,req.context,'withdraw-expired',480_000,2,5_000);
    expect(mature.payoutSats+mature.feeSats).toBe(100_000);expect(Psbt.fromBase64(mature.psbtBase64,{network:networks.testnet}).txOutputs[0]!.address).toBe(wallet.address);
  });
  it('fuzzes amount/fee preservation across 100 generated stakes',async()=>{
    await fc.assert(fc.asyncProperty(fc.integer({min:50_000,max:1_000_000}),fc.integer({min:1,max:10}),async(amount,rate)=>{
      const req=fixture(amount+50_000,amount);req.feeRateSatVb=rate;req.maxFeeSats=30_000;
      const plan=await buildBabylonStakePlan(req);const tx=Transaction.fromHex(plan.unsignedTxHex);
      expect(plan.feeSats).toBeGreaterThan(0);expect(plan.feeSats).toBeLessThanOrEqual(req.maxFeeSats);
      expect(tx.outs.reduce((a,o)=>a+o.value,0)+plan.feeSats).toBe(plan.inputValueSats);
      expect(tx.outs[plan.stakingOutputIndex]!.value).toBe(amount);
    }),{numRuns:100});
  });
});
