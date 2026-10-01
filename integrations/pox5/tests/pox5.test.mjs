import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Cl, cvToHex, hexToCV } from '@stacks/transactions';
import * as sdk from '@stacks/bitcoin-staking';
import * as btc from '@scure/btc-signer';
import { createPox5Client, exactUint, strictClarity } from '../src/index.mjs';
import pins from '../src/source-pins.json' with {type:'json'};

const source=fs.readFileSync(new URL('./fixtures/pox-5.testnet.clar',import.meta.url),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),pins.testnet.sha256);
const owner='ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX';
const signerManager=owner+'.signer-manager';
const mainnetOwner='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const pub='0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const otherPub='0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const early='21'+otherPub+'ac';
const tip='0x'+'b'.repeat(64);
const hx=b=>Buffer.from(b).toString('hex');
const cv=(x)=>cvToHex(x);
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const args={address:owner,bondIndex:11,amountSats:100000n,signerManager};
function fixture(options={}) {
  let time=1000000; const requests=[];
  const info={network_id:0x80000000,stacks_tip_height:500,burn_block_height:22500,stacks_tip:'a'.repeat(64),...options.info};
  const block={canonical:true,height:500,hash:'0x'+'a'.repeat(64),index_block_hash:tip,...options.block};
  const pox={contract_id:pins.testnet.contract,current_burnchain_block_height:info.burn_block_height,first_burnchain_block_height:0,reward_cycle_id:25,reward_cycle_length:900,prepare_cycle_length:100,reward_slots:1600,current_cycle:{id:25,stacked_ustx:'10000000',is_pox_active:true},next_cycle:{id:26,stacked_ustx:'10000000'},contract_versions:[{contract_id:pins.testnet.contract,activation_burnchain_block_height:2702,first_reward_cycle_id:4}],pox_5_sbtc_contract:'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-token',pox_5_sbtc_registry_contract:'SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1.sbtc-registry',...options.pox};
  const fields=new Map([
    ['get-protocol-bond',Cl.some(Cl.tuple({'target-rate':Cl.uint(1000),'stx-value-ratio':Cl.uint(1000),'min-ustx-ratio':Cl.uint(500),'early-unlock-bytes':Cl.bufferFromHex(early)}))],
    ['protocol-bond-allowances',Cl.some(Cl.uint(1000000))],
    ['get-staker-info',Cl.none()],['get-bond-membership',Cl.none()],
    ['get-signer-info',Cl.some(Cl.bufferFromHex(pub))],['verify-signer-key-grant',Cl.ok(Cl.bool(true))],
  ]);
  const set=(fn,value)=>fields.set(fn,value); options.mutate?.(set);
  const account={balance:'10000000',locked:'0',nonce:0,unlock_height:0,...options.account};
  async function fetch(url,init) {
    const u=new URL(typeof url==='string'?url:url.url);requests.push({url:u.toString(),init});
    if(options.httpFailure) return reply({},503);
    if(u.pathname==='/v2/info')return reply(info);
    if(u.pathname.startsWith('/extended/v2/blocks/'))return reply(block);
    if(u.pathname.includes('/contracts/source/'))return reply({source:options.sourceMismatch?source+'\n':source});
    if(u.pathname==='/v2/pox')return reply(pox);
    if(u.pathname.startsWith('/v2/accounts/'))return reply(account);
    const fn=u.pathname.split('/').at(-1);
    if(u.pathname.startsWith('/v2/contracts/call-read/')) {
      let value=fields.get(fn);
      if(fn==='get-bond-l1-unlock-height') {
        const parsed=await sdk.fetchPoxInfo({network:'testnet',client:{baseUrl:'https://api.testnet.hiro.so',fetch}});
        value=Cl.uint(options.unlockHeight??sdk.computeBondUnlockHeight({bondIndex:11,poxInfo:parsed}));
      }
      if(fn==='construct-lockup-output-script') {
        if(options.expireOnScript) time+=60001;
        const a=JSON.parse(init.body).arguments.map(hexToCV);
        const script=sdk.buildLockScript({stxAddress:a[0].value,unlockHeight:Number(a[1].value),unlockBytes:a[2].value,earlyUnlockBytes:a[3].value});
        value=Cl.ok(Cl.buffer(options.scriptMismatch?new Uint8Array([0]):sdk.scriptToWshOutput(script)));
      }
      assert.ok(value,`Unexpected fixture read ${fn}`);
      const encoded=cv(value);
      return reply({okay:options.readFailed!==fn,result:options.malformedFn===fn?options.malformed:encoded+(options.trailingScript&&fn==='construct-lockup-output-script'?'ff':'')});
    }
    if(u.pathname.startsWith('/v2/map_entry/')) {
      assert.ok(fields.has(fn),`Unexpected fixture map ${fn}`);
      return reply({data:options.malformedFn===fn?options.malformed:cv(fields.get(fn))});
    }
    throw Error(`Unexpected fixture URL ${u}`);
  }
  const client=createPox5Client({network:'testnet',fetch,now:()=>time});
  return {client,requests,set,info,pox,account,advance:(ms=60001)=>{time+=ms;}};
}
async function observed(options) {const f=fixture(options);return {...f,state:await f.client.observe(args)};}
async function locked(options) {const f=await observed(options);return {...f,plan:await f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000})};}
const backup=p=>JSON.parse(JSON.stringify(p,(_,v)=>typeof v==='bigint'?v.toString():v));

// These tests use real pinned SDK behavior against deterministic RPC responses.
// They do not claim that any wallet is actually allowlisted or owns the fixture keys.
test('exact integer bounds reject rounded JS numbers and noncanonical strings',()=>{
  for(const bad of [1,1.2,-1n,'01','1e4','-1','1.0',null,undefined,0n,(1n<<128n)])assert.throws(()=>exactUint(bad));
  assert.equal(exactUint('100000'),100000n);assert.equal(exactUint(0n,{zero:true}),0n);
});
test('strict Clarity decoder rejects malformed, truncated and trailing bytes',()=>{
  assert.equal(strictClarity(cv(Cl.uint(1))).value,1n);
  for(const bad of ['0x','0x0','0xzz','0x01',cv(Cl.uint(1))+'00'])assert.throws(()=>strictClarity(bad));
});
test('observation uses canonical pinned reads and never authorizes BTC funding',async()=>{
  const {state,requests}=await observed();assert.equal(state.preflightPassed,true);assert.equal(state.requiredUstx,50000n);assert.equal(state.fundingAllowed,false);assert.equal(state.bitcoinNetwork,'regtest');assert.ok(Object.isFrozen(state.bond));
  for(const r of requests.filter(r=>/call-read|map_entry|v2\/accounts/.test(r.url)))assert.equal(new URL(r.url).searchParams.get('tip'),tip);
});
test('wrong chain, noncanonical tips and source mismatch fail closed',async()=>{
  for(const opts of [{info:{network_id:1}},{block:{canonical:false}},{block:{hash:'0x'+'c'.repeat(64)}},{block:{index_block_hash:'bad'}},{sourceMismatch:true},{httpFailure:true}])await assert.rejects(()=>observed(opts));
});
test('missing or inactive PoX5 and changing Bitcoin tip fail before eligibility',async()=>{
  for(const pox of [{contract_id:'ST000000000000000000002AMW42H.pox-4'},{contract_versions:[]},{current_burnchain_block_height:22501},{reward_cycle_length:0},{prepare_cycle_length:900}])await assert.rejects(()=>observed({pox}));
});
test('network-incompatible wallet and signer manager are rejected without RPC',async()=>{
  const f=fixture();for(const input of [{...args,address:mainnetOwner},{...args,signerManager:mainnetOwner+'.signer'}, {...args,address:owner+'.contract'},{...args,bondIndex:-1},{...args,bondIndex:100000},{...args,amountSats:10}])await assert.rejects(()=>f.client.observe(input));assert.equal(f.requests.length,0);
});
test('missing bond, allowance, insufficient allocation and missing signer never produce a lock plan',async()=>{
  for(const mutate of [set=>set('get-protocol-bond',Cl.none()),set=>set('protocol-bond-allowances',Cl.none()),set=>set('protocol-bond-allowances',Cl.some(Cl.uint(99999))),set=>set('get-signer-info',Cl.none()),set=>set('verify-signer-key-grant',Cl.error(Cl.uint(17)))]) {
    const f=await observed({mutate});assert.equal(f.state.preflightPassed,false);assert.equal(f.state.fundingAllowed,false);await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/prerequisites/);
  }
  const f=fixture();assert.equal((await f.client.observe({...args,signerManager:undefined})).preflightPassed,false);
});
test('insufficient paired STX and an existing membership block new commitment preparation',async()=>{
  const low=await observed({account:{balance:'49999'}});assert.equal(low.state.preflightPassed,false);
  const membership=Cl.some(Cl.tuple({'bond-index':Cl.uint(10),'amount-ustx':Cl.uint(50000),signer:Cl.principal(signerManager),'is-l1-lock':Cl.bool(true),'amount-sats':Cl.uint(100000)}));
  const active=await observed({mutate:set=>set('get-bond-membership',membership)});assert.equal(active.state.preflightPassed,false);assert.ok(active.state.reasons.some(r=>r.includes('rollover')));
});
test('earlier prepare phase and final registration cutoff block funding despite announced bond',async()=>{
  for(const height of [22450,23300,23400,34000]) {const f=await observed({info:{burn_block_height:height}});assert.equal(f.state.preflightPassed,false);await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}));}
});
test('malformed account and strict contract/map encodings fail before a usable observation',async()=>{
  for(const account of [{balance:'-1'},{locked:'-1'},{balance:'garbage'}])await assert.rejects(()=>observed({account}));
  for(const malformed of ['0x01',cv(Cl.none())+'ff','0x0','0xzz'])for(const malformedFn of ['get-protocol-bond','protocol-bond-allowances'])await assert.rejects(()=>observed({malformed,malformedFn}));
  await assert.rejects(()=>observed({readFailed:'get-protocol-bond'}));
});
test('invalid bond early-unlock script and out-of-range paired ratio are rejected',async()=>{
  for(const [ratio,bytes] of [[10001,early],[500,'00']])await assert.rejects(()=>observed({mutate:set=>set('get-protocol-bond',Cl.some(Cl.tuple({'target-rate':Cl.uint(1000),'stx-value-ratio':Cl.uint(1000),'min-ustx-ratio':Cl.uint(ratio),'early-unlock-bytes':Cl.bufferFromHex(bytes)})))}));
});
test('expired and copied observations cannot produce lock plans',async()=>{
  const f=await observed();await assert.rejects(()=>f.client.prepareLock({...f.state},{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/observation/);f.advance();await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/expired/);
});
test('invalid public keys and reviewed maximum lock height reject preparation',async()=>{
  const f=await observed();for(const bitcoinPublicKey of ['04'+'00'.repeat(64),'02ff','02'+'ff'.repeat(32),null])await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey,maxUnlockHeight:40000}));
  await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:22500}),/maximum/);
});
test('fresh allowance revocation or changed bond data prevents a previously eligible plan',async()=>{
  const f=await observed();f.set('protocol-bond-allowances',Cl.none());await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/changed/);
  const g=await observed();g.set('get-protocol-bond',Cl.some(Cl.tuple({'target-rate':Cl.uint(1000),'stx-value-ratio':Cl.uint(2000),'min-ustx-ratio':Cl.uint(500),'early-unlock-bytes':Cl.bufferFromHex(early)})));await assert.rejects(()=>g.client.prepareLock(g.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/changed/);
});
test('real SDK creates immutable regtest lock plan and pins its final canonical script read',async()=>{
  const f=await locked();assert.equal(f.plan.broadcastAllowed,false);assert.equal(f.plan.fundingAllowed,false);assert.match(f.plan.lockAddress,/^bcrt1/);assert.equal(f.plan.amountSats,100000n);assert.ok(Object.isFrozen(f.plan));
  const calls=f.requests.filter(r=>/construct-lockup-output-script|get-bond-l1-unlock-height/.test(r.url));assert.ok(calls.some(r=>r.url.includes('get-bond-l1-unlock-height')));
  for(const r of calls)assert.equal(new URL(r.url).searchParams.get('tip'),tip);
});
test('canonical script mismatch and trailing canonical script bytes reject preparation',async()=>{
  await assert.rejects(()=>locked({scriptMismatch:true}),/lock script/);
  await assert.rejects(()=>locked({trailingScript:true}),/Trailing Clarity/);
});
test('canonical bond unlock-height mismatch rejects a locally coherent but wrong schedule',async()=>{
  await assert.rejects(()=>locked({unlockHeight:39999}),/bond unlock height/);
});

function recoveryInput(plan,{value=100000n,script=plan.outputScript}={}) {
  const raw=btc.RawTx.encode({version:2,segwitFlag:false,inputs:[{txid:new Uint8Array(32).fill(1),index:0,finalScriptSig:new Uint8Array([0x51]),sequence:0xffffffff}],outputs:[{script:Buffer.from(script,'hex'),amount:value}],lockTime:0});
  const tx=btc.Transaction.fromRaw(raw,{allowUnknownInputs:true,allowUnknownOutputs:true});
  return {txid:tx.id,vout:0,value,scriptPubKey:plan.outputScript,rawTransactionHex:hx(raw)};
}
const recoveryDestination=btc.p2wpkh(Buffer.from(pub,'hex'),{...btc.TEST_NETWORK,bech32:'bcrt'}).address;
const mainnetDestination=btc.p2wpkh(Buffer.from(pub,'hex')).address;
const reclaimArgs=plan=>({utxo:recoveryInput(plan),destination:recoveryDestination,feeSats:1000n,maxFeeSats:2000n,currentBitcoinHeight:plan.unlockHeight});
test('saved JSON lock plans reconstruct a usable unsigned recovery after restart',async()=>{
  const f=await locked();const saved=backup(f.plan);const restarted=createPox5Client({network:'testnet',fetch:()=>{throw Error('Recovery must not depend on live RPC eligibility');}});
  const recovery=restarted.prepareReclaim(saved,reclaimArgs(f.plan));assert.equal(recovery.broadcastAllowed,false);assert.equal(recovery.outputSats,99000n);assert.equal(recovery.feeSats,1000n);
  const tx=btc.Transaction.fromPSBT(Buffer.from(recovery.unsignedPsbtHex,'hex'),{allowUnknownInputs:true,allowUnknownOutputs:true,disableScriptCheck:true});
  assert.equal(tx.inputsLength,1);assert.equal(tx.outputsLength,1);assert.equal(tx.lockTime,f.plan.unlockHeight);assert.equal(tx.getOutput(0).amount,99000n);
  assert.equal(hx(tx.getInput(0).witnessScript),f.plan.lockScript);assert.equal(tx.getInput(0).witnessUtxo.amount,100000n);
});
test('mutated saved lock script, wallet key, Stacks owner and network fail reconstruction',async()=>{
  const f=await locked();const changes=[{lockScript:f.plan.lockScript+'00'},{outputScript:'00'},{unlockBytes:'00'},{bitcoinPublicKey:otherPub},{stxAddress:'ST000000000000000000002AMW42H'},{unlockHeight:f.plan.unlockHeight+1},{lockAddress:recoveryDestination},{network:'mainnet'},{bitcoinNetwork:'testnet'},{earlyUnlockBytes:'21'+pub+'ac'}];
  for(const changed of changes)assert.throws(()=>f.client.prepareReclaim({...backup(f.plan),...changed},reclaimArgs(f.plan)));
});
test('recovery requires the real raw transaction and exact outpoint, output, amount and script',async()=>{
  const f=await locked(),valid=reclaimArgs(f.plan);for(const change of [{txid:'aa'.repeat(32)},{txid:'bad'},{vout:-1},{vout:1},{value:100001n},{scriptPubKey:'00'},{rawTransactionHex:undefined},{rawTransactionHex:'00'}])assert.throws(()=>f.client.prepareReclaim(f.plan,{...valid,utxo:{...valid.utxo,...change}}));
  for(const input of [recoveryInput(f.plan,{value:100001n}),recoveryInput(f.plan,{script:'51'})])assert.throws(()=>f.client.prepareReclaim(f.plan,{...valid,utxo:{...input,value:100000n}}));
});
test('recovery rejects premature height, excessive fees, dust and the wrong Bitcoin network',async()=>{
  const f=await locked(),valid=reclaimArgs(f.plan);
  for(const changes of [{currentBitcoinHeight:f.plan.unlockHeight-1},{currentBitcoinHeight:-1},{feeSats:2001n},{feeSats:100000n,maxFeeSats:100000n},{feeSats:99900n,maxFeeSats:100000n},{destination:mainnetDestination},{destination:'not-an-address'}])assert.throws(()=>f.client.prepareReclaim(f.plan,{...valid,...changes}));
});
test('signer key and early unlock policy changes require a fresh user review',async()=>{
  const f=await observed();f.set('get-signer-info',Cl.some(Cl.bufferFromHex(otherPub)));await assert.rejects(()=>f.client.prepareLock(f.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/changed/);
  const g=await observed();g.set('get-protocol-bond',Cl.some(Cl.tuple({'target-rate':Cl.uint(1000),'stx-value-ratio':Cl.uint(1000),'min-ustx-ratio':Cl.uint(500),'early-unlock-bytes':Cl.bufferFromHex('21'+pub+'ac')})));await assert.rejects(()=>g.client.prepareLock(g.state,{bitcoinPublicKey:pub,maxUnlockHeight:40000}),/changed/);
});

test('malformed false signer-grant success is rejected instead of authorizing preparation',async()=>{
  await assert.rejects(()=>observed({mutate:set=>set('verify-signer-key-grant',Cl.ok(Cl.bool(false)))}));
});

test('slow final canonical script reads cannot return an expired lock preparation',async()=>{
  await assert.rejects(()=>locked({expireOnScript:true}),/expired/i);
});
test('saved flags never authorize broadcasting or override recovery script verification',async()=>{
  const f=await locked();const saved={...backup(f.plan),broadcastAllowed:true,fundingAllowed:true};
  assert.equal(f.client.prepareReclaim(saved,reclaimArgs(f.plan)).broadcastAllowed,false);
});
test('omitting bond index discovers the next registration bond using the active schedule',async()=>{
  const f=fixture();const state=await f.client.observe({...args,bondIndex:undefined});assert.equal(state.bondIndex,11);assert.equal(state.status,'open');
  const request=f.requests.find(r=>new URL(r.url).pathname.endsWith('/get-protocol-bond'));
  assert.equal(hexToCV(JSON.parse(request.init.body).arguments[0]).value,11n);
  const bad=fixture({pox:{contract_versions:[{contract_id:pins.testnet.contract,activation_burnchain_block_height:2702,first_reward_cycle_id:'invalid'}]}});
  await assert.rejects(()=>bad.client.observe({...args,bondIndex:undefined}),/activation cycle/);
});
