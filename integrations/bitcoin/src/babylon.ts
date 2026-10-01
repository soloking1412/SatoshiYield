import type { BabylonContext, BabylonStakePlan, BabylonStakeRequest, BitcoinRecoveryPlan, BitcoinWalletBinding, VerifiedUtxo } from './types.js';
import { MAX_CONTEXT_AGE_MS } from './types.js';
import { canonicalJson, checkContext, checkWalletNetwork, digest, ensure, hex, integer } from './validation.js';

async function libraries() {
  if (typeof globalThis.Buffer === 'undefined') { const {Buffer} = await import('buffer'); globalThis.Buffer = Buffer as typeof globalThis.Buffer; }
  const [btc, sdk, ecc] = await Promise.all([import('bitcoinjs-lib'), import('@babylonlabs-io/btc-staking-ts'), import('@bitcoinerlab/secp256k1')]);
  btc.initEccLib(ecc);
  return { btc, sdk, ecc };
}
async function walletScript(wallet: BitcoinWalletBinding) {
  checkWalletNetwork(wallet);
  const { btc, ecc } = await libraries();
  const key = Buffer.from(hex(wallet.publicKeyHex, 33, 'compressed wallet public key'), 'hex');
  ensure(ecc.isPoint(key) && (key[0] === 2 || key[0] === 3), 'Invalid compressed wallet key');
  const actual = btc.address.toOutputScript(wallet.address, btc.networks.testnet);
  const wpkh = btc.payments.p2wpkh({pubkey:key,network:btc.networks.testnet}).output!;
  const tr = btc.payments.p2tr({internalPubkey:key.subarray(1),network:btc.networks.testnet}).output!;
  ensure(actual.equals(wpkh) || actual.equals(tr), 'Wallet address does not belong to staking public key, or is unsupported (native SegWit/Taproot only)');
  return { script: actual, xOnlyKey: key.subarray(1).toString('hex') };
}
function selectedParameters(context: BabylonContext) {
  const params = context.parameters.filter(p => p.btcActivationHeight <= context.babylonBitcoinTipHeight).sort((a,b) => b.btcActivationHeight-a.btcActivationHeight || b.version-a.version)[0];
  ensure(params, 'No activated Babylon parameter version');
  return params;
}
async function validateFunding(wallet: BitcoinWalletBinding, utxos: VerifiedUtxo[], context: BabylonContext) {
  const { btc } = await libraries();
  const { script, xOnlyKey } = await walletScript(wallet);
  ensure(Array.isArray(utxos) && utxos.length > 0 && utxos.length <= 20, 'Select between one and twenty confirmed wallet UTXOs');
  const seen = new Set<string>();
  let total = 0;
  const mapped = utxos.map(u => {
    const txid = hex(u.txid, 32, 'funding transaction ID');
    integer(u.vout, 'funding output index', 0, 0xffffffff);
    integer(u.valueSat, 'funding value', 1, 2_100_000_000_000_000);
    integer(u.confirmedHeight, 'funding confirmation height', 1, context.bitcoinTipHeight);
    ensure(!seen.has(`${txid}:${u.vout}`), 'Duplicate funding outpoint'); seen.add(`${txid}:${u.vout}`);
    ensure(typeof u.rawTransactionHex === 'string' && u.rawTransactionHex.length <= 2_000_000, 'Missing or oversized funding transaction');
    const previous = btc.Transaction.fromHex(u.rawTransactionHex);
    const out = previous.outs[u.vout];
    ensure(previous.getId() === txid && out?.value === u.valueSat && out.script.toString('hex') === u.scriptPubKey && out.script.equals(script), 'Funding UTXO does not match its transaction or wallet script');
    total += u.valueSat; integer(total, 'total funding value', 1, 2_100_000_000_000_000);
    return {txid,vout:u.vout,value:u.valueSat,scriptPubKey:u.scriptPubKey,rawTxHex:u.rawTransactionHex};
  });
  return {mapped,script,xOnlyKey};
}
export async function buildBabylonStakePlan(request: BabylonStakeRequest, now = Date.now()): Promise<BabylonStakePlan> {
  // Clone first: callers cannot mutate the wallet/fee/parameters while SDK imports await.
  const input = structuredClone(request);
  checkContext(input.context, now);
  integer(input.stakingSats, 'stake amount', 1, 2_100_000_000_000_000);
  integer(input.stakingBlocks, 'stake timelock', 1, 65535);
  integer(input.maxFeeSats, 'maximum network fee', 1, input.stakingSats);
  ensure(Number.isFinite(input.feeRateSatVb) && input.feeRateSatVb >= 1 && input.feeRateSatVb <= 1000, 'Fee rate must be between 1 and 1000 sat/vB');
  const params = selectedParameters(input.context);
  ensure(input.stakingSats >= params.minStakingAmountSat && input.stakingSats <= params.maxStakingAmountSat, 'Amount is outside active Babylon stake bounds');
  const providerKey = hex(input.finalityProviderPublicKey, 32, 'finality provider');
  const provider = input.context.finalityProviders.find(p => p.publicKey === providerKey && p.status === 'active');
  ensure(provider && /^0\.\d+$/.test(provider.commission) && Number(provider.commission) <= 1, 'Choose an active finality provider with a valid commission');
  const {mapped,script,xOnlyKey} = await validateFunding(input.wallet,input.utxos,input.context);
  const allKeys = [xOnlyKey,providerKey,...params.covenantNoCoordPks];
  ensure(new Set(allKeys).size === allKeys.length, 'Staker, finality provider and covenant keys must be distinct');
  const {btc,sdk,ecc} = await libraries();
  ensure(allKeys.every(k => ecc.isXOnlyPoint(Buffer.from(k,'hex'))), 'Invalid secp256k1 protocol key');
  const staking = new sdk.Staking(btc.networks.testnet,{address:input.wallet.address,publicKeyNoCoordHex:xOnlyKey},params,[providerKey],input.stakingBlocks);
  const {transaction,fee} = staking.createStakingTransaction(input.stakingSats,mapped,input.feeRateSatVb);
  const psbt = staking.toStakingPsbt(transaction,mapped);
  const used = transaction.ins.map(i => mapped.find(u => u.txid === Buffer.from(i.hash).reverse().toString('hex') && u.vout === i.index));
  ensure(used.every(Boolean), 'SDK selected an unreviewed funding input');
  const inputValue = used.reduce((sum,u) => sum + u!.value,0);
  const feeFromOutputs = inputValue - transaction.outs.reduce((sum,o) => sum + o.value,0);
  ensure(fee === feeFromOutputs && fee > 0 && fee <= input.maxFeeSats, 'Network fee exceeds reviewed maximum or SDK accounting disagrees');
  ensure(transaction.outs.length >= 1 && transaction.outs.length <= 2, 'Unexpected staking outputs');
  const stakingOutputIndex = transaction.outs.findIndex(o => o.value === input.stakingSats && !o.script.equals(script));
  ensure(stakingOutputIndex >= 0 && transaction.outs.every((o,i) => i === stakingOutputIndex || o.script.equals(script)), 'Stake/change output is not bound to the reviewed wallet');
  const unsigned: Omit<BabylonStakePlan,'reviewDigest'> = {
    protocol:'babylon',network:'signet',kind:'stake',wallet:input.wallet,unsignedTxHex:transaction.toHex(),psbtBase64:psbt.toBase64(),stakingTxId:transaction.getId(),stakingOutputIndex,stakingOutputScript:transaction.outs[stakingOutputIndex]!.script.toString('hex'),stakingSats:input.stakingSats,stakingBlocks:input.stakingBlocks,finalityProviderPublicKey:providerKey,finalityProviderCommission:provider.commission,parameters:structuredClone(params),feeSats:fee,maxFeeSats:input.maxFeeSats,inputValueSats:inputValue,expiresAtMs:Math.min(now + MAX_CONTEXT_AGE_MS,input.context.fetchedAtMs + MAX_CONTEXT_AGE_MS),broadcastAllowed:false,nextStep:'babylon-pre-staking-registration',recovery:{earlyUnbondingBlocks:params.unbondingTime,earlyUnbondingFeeSats:params.unbondingFeeSat,slashFraction:params.slashing.slashingRate,requiresCovenantQuorum:params.covenantQuorum},
  };
  return {...unsigned,reviewDigest:await digest(unsigned)};
}
export async function verifyBabylonPlan(plan: BabylonStakePlan, now = Date.now()): Promise<void> {
  const {reviewDigest,...unsigned} = plan;
  ensure(await digest(unsigned) === reviewDigest,'Reviewed Bitcoin plan was modified');
  ensure(plan.protocol === 'babylon' && plan.network === 'signet' && plan.broadcastAllowed === false,'Unsupported Bitcoin plan');
  ensure(plan.expiresAtMs > now,'Bitcoin plan expired; refresh network and fee review');
  await walletScript(plan.wallet);
}
/** Verifies the PSBT came back unchanged except for safe ALL/default signatures. It deliberately rejects finalized PSBTs. */
export async function validateReturnedStakePsbt(plan: BabylonStakePlan, candidateBase64: string, currentWallet: BitcoinWalletBinding, now = Date.now()): Promise<void> {
  await verifyBabylonPlan(plan,now);
  ensure(canonicalJson(currentWallet) === canonicalJson(plan.wallet),'Wallet changed after review');
  const {btc,ecc} = await libraries();
  const expected = btc.Psbt.fromBase64(plan.psbtBase64,{network:btc.networks.testnet});
  const candidate = btc.Psbt.fromBase64(candidateBase64,{network:btc.networks.testnet});
  ensure(candidate.data.globalMap.unsignedTx.toBuffer().equals(expected.data.globalMap.unsignedTx.toBuffer()),'Wallet changed transaction inputs, outputs, fee, sequence or locktime');
  ensure(canonicalJson(candidate.data.outputs) === canonicalJson(expected.data.outputs),'Wallet changed PSBT output metadata');
  ensure(!candidate.data.globalMap.unknownKeyVals?.length,'Unexpected global PSBT metadata');
  candidate.data.inputs.forEach((input,i) => {
    ensure(!input.finalScriptSig && !input.finalScriptWitness && !input.tapScriptSig, 'Only non-finalized wallet key signatures are accepted');
    ensure(input.sighashType === undefined || input.sighashType === 0 || input.sighashType === btc.Transaction.SIGHASH_ALL, 'Unsafe Bitcoin signature hash mode');
    for (const sig of input.partialSig ?? []) ensure(sig.signature.at(-1) === btc.Transaction.SIGHASH_ALL,'Signature must cover all inputs and outputs');
    if (input.tapKeySig) ensure(input.tapKeySig.length === 64 || (input.tapKeySig.length === 65 && input.tapKeySig.at(-1) === 1),'Unsafe Taproot signature hash mode');
    const {partialSig:_partial,tapKeySig:_tap,...metadata} = input;
    const {partialSig:_epartial,tapKeySig:_etap,...expectedMetadata} = expected.data.inputs[i]!;
    ensure(canonicalJson(metadata) === canonicalJson(expectedMetadata),'Wallet changed funding value, script, key path or PSBT input metadata');
  });
  ensure(candidate.validateSignaturesOfAllInputs((pubkey,hash,signature) => pubkey.length === 32 ? ecc.verifySchnorr(hash,pubkey,signature) : ecc.verify(hash,pubkey,signature)), 'Invalid or missing Bitcoin wallet signatures');
}
/** Builds recovery transactions locally from the exact reviewed staking transaction. No covenant signatures are synthesized. */
export async function buildBabylonRecoveryPlan(plan: BabylonStakePlan, context: BabylonContext, kind: 'early-unbond' | 'withdraw-expired', confirmedHeight: number, feeRateSatVb: number, maxFeeSats: number, now = Date.now()): Promise<BitcoinRecoveryPlan> {
  const copy = structuredClone(plan);
  // Old stakes remain recoverable after the original quote expires; integrity remains mandatory.
  const {reviewDigest,...unsigned} = copy;
  ensure(await digest(unsigned) === reviewDigest,'Stored staking recovery record was modified');
  checkContext(context,now);
  integer(confirmedHeight,'staking confirmation height',1,context.bitcoinTipHeight);
  integer(maxFeeSats,'recovery fee cap',1,copy.stakingSats);
  ensure(Number.isFinite(feeRateSatVb) && feeRateSatVb >= 1 && feeRateSatVb <= 1000,'Invalid recovery fee rate');
  const {btc,sdk} = await libraries();
  const {xOnlyKey,script} = await walletScript(copy.wallet);
  const params = context.parameters.find(p => p.version === copy.parameters.version);
  ensure(params && canonicalJson(params) === canonicalJson(copy.parameters),'Historical staking parameters not available or changed');
  const staking = new sdk.Staking(btc.networks.testnet,{address:copy.wallet.address,publicKeyNoCoordHex:xOnlyKey},copy.parameters,[copy.finalityProviderPublicKey],copy.stakingBlocks);
  const tx = btc.Transaction.fromHex(copy.unsignedTxHex);
  ensure(tx.getId() === copy.stakingTxId && tx.outs[copy.stakingOutputIndex]?.script.toString('hex') === copy.stakingOutputScript,'Stored staking transaction does not match recovery record');
  let psbt; let fee: number; let requirements: string[];
  if(kind === 'early-unbond') {
    const unbond = staking.createUnbondingTransaction(tx);
    psbt = staking.toUnbondingPsbt(unbond.transaction,tx); fee = unbond.fee;
    requirements = ['Verify confirmed original staking transaction against a Bitcoin node.','Verify active Babylon delegation and authentic covenant signatures reaching the historical quorum.','Sign with the original staking wallet, then wait for Bitcoin confirmation plus the unbonding timelock before withdrawal.'];
  } else {
    ensure(kind === 'withdraw-expired','Unsupported recovery kind');
    ensure(context.bitcoinTipHeight >= confirmedHeight + copy.stakingBlocks,'Staking timelock has not matured');
    const withdrawal = staking.createWithdrawStakingExpiredPsbt(tx,feeRateSatVb);
    psbt = withdrawal.psbt; fee = withdrawal.fee;
    ensure(psbt.txOutputs.length === 1 && psbt.txOutputs[0]!.script.equals(script),'Recovery destination changed');
    requirements = ['Verify the original transaction confirmation height and unspent staking output against a Bitcoin node.','Recheck maturity and sign only with the original staking wallet.'];
  }
  ensure(fee > 0 && fee <= maxFeeSats,'Recovery fee exceeds reviewed maximum');
  const payout = psbt.txOutputs.reduce((sum,o) => sum + o.value,0);
  ensure(copy.stakingSats - payout === fee && payout > 0,'Recovery accounting mismatch');
  const payload: Omit<BitcoinRecoveryPlan,'reviewDigest'> = {protocol:'babylon',network:'signet',kind,psbtBase64:psbt.toBase64(),unsignedTxHex:psbt.data.globalMap.unsignedTx.toBuffer().toString('hex'),feeSats:fee,payoutSats:payout,expiresAtMs:now+MAX_CONTEXT_AGE_MS,broadcastAllowed:false,requirements};
  return {...payload,reviewDigest:await digest(payload)};
}
