import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Cl,cvToHex,PostConditionMode} from '@stacks/transactions';
import {CONTRACTS as C,createStacksIntegrationClient,uint,minimumOutput,stackingRates,assertEventPolicy,walletPrincipal} from '../src/index.mjs';
import manifest from '../manifests/mainnet.json' with {type:'json'};
const owner='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const other='SP8YMPEBK0P9W3SYCAEB1M1XJFEJTP08RWG4G16E';
const sources=new Map(await Promise.all(manifest.contracts.map(async r=>[r.contract,await readFile(new URL('../'+r.sourceFile,import.meta.url),'utf8')])));
const guardSource=await readFile(new URL('../contracts/stackingdao-request-guard-v1.clar',import.meta.url),'utf8');
const guard=`${owner}.queue-guard`;
const b=v=>Cl.bool(v);const u=v=>Cl.uint(v);const ok=v=>Cl.ok(v);const key=(c,f)=>`${c}.${f}`;
function fixture({mutate=()=>{},guardEnabled=false,chainId=1,sourceMismatch=false,malformed=null}={}) {
 let time=100000; const reads=[]; const fields=new Map();const set=(c,f,v)=>fields.set(key(c,f),v);
 set(C.sbtc,'get-balance-available',ok(u(10000000)));
 set(C.zest,'get-balance',ok(u(1000000)));set(C.zest,'get-pause-states',ok(Cl.tuple({deposit:b(false),redeem:b(false),accrue:b(false)})));
 set(C.zest,'get-cap-supply',ok(u(100000000)));set(C.zest,'get-total-assets',ok(u(10000000)));set(C.zest,'get-available-assets',u(10000000));
 set(C.zest,'get-underlying',ok(Cl.principal(C.sbtc)));set(C.zestRegistry,'get-asset-status',ok(Cl.tuple({addr:Cl.principal(C.zest),collateral:b(true),debt:b(false)})));
 set(C.zest,'convert-to-shares',ok(u(99990)));set(C.zest,'convert-to-assets',ok(u(100001)));
 set(C.stbtc,'get-balance',ok(u(1000000)));set(C.stbtc,'get-total-supply',ok(u(10000000)));
 set(C.dao,'get-contracts-enabled',b(true));set(C.dao,'get-contract-active',b(true));
 for(const f of ['get-shutdown-deposits','get-shutdown-init-withdraw','get-shutdown-withdraw','get-shutdown-withdraw-idle','is-fee-exempt'])set(C.stackingCore,f,b(false));
 set(C.stackingCore,'get-withdraw-fee',u(0));set(C.stackingCore,'get-withdraw-idle-fee',u(100));
 set(C.ratio,'get-pending-shares',u(0));set(C.ratio,'get-sbtc-per-stbtc',u(100000000));set(C.ratio,'get-sbtc-per-stbtc-up',u(100000000));
 set(C.reserve,'get-total-sbtc',u(10000000));set(C.reserve,'get-sbtc-for-withdrawals',u(0));set(C.reserve,'get-sbtc-balance',u(10000000));
 set(C.rewards,'get-ready-to-release',u(1000));set(C.rewards,'get-sbtc-balance',u(10000));set(C.rewards,'get-ststxbtc-bps',u(0));set(C.rewards,'get-ststx-bps',u(0));
 set(C.rewards,'get-stx-reward-recipient',Cl.none());set(C.rewards,'get-keeper',Cl.some(Cl.principal(other)));
 set(C.ststxbtc,'get-total-supply',ok(u(1000000)));set(C.ststxbtcV2,'get-total-supply',ok(u(1000000)));set(C.withdrawals,'get-withdraw-cooldown-blocks',u(2100));
 set(C.nft,'get-owner',ok(Cl.some(Cl.principal(owner))));set(C.withdrawals,'get-withdrawals-by-nft',Cl.tuple({'asset-amount':u(100000),'token-amount':u(99990),'withdraw-fee':u(0),'unlock-burn-height':u(100)}));
 mutate(set);
 const fetch=async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/v2/info')return {ok:true,json:async()=>({network_id:chainId,stacks_tip_height:500,burn_block_height:100,stacks_tip:'a'.repeat(64)})};
  if(path.startsWith('/extended/v2/blocks/'))return {ok:true,json:async()=>({canonical:true,height:500,hash:'0x'+'a'.repeat(64),index_block_hash:'0x'+'b'.repeat(64)})};
  if(path.includes('/source/')){const [a,n]=path.split('/').slice(-2);return {ok:true,json:async()=>({source:sourceMismatch?'changed':`${a}.${n}`===guard?guardSource:sources.get(`${a}.${n}`)})};}
  if(path.includes('/call-read/')){reads.push(url);const [a,n,f]=path.split('/').slice(-3);const value=fields.get(key(`${a}.${n}`,f));assert.ok(value,`Unmocked read ${n}.${f}`);return {ok:true,json:async()=>({okay:true,result:malformed??cvToHex(value)})};}
  throw new Error('Unhandled test RPC');
 };
 return {client:createStacksIntegrationClient({fetch,now:()=>time,queueGuard:guardEnabled?guard:null}),advance:()=>{time+=60001;},reads,set};
}
const wallet={walletAddress:owner,network:'mainnet'};

test('exact uint boundaries reject floats, numbers, exponent notation, negatives and leading zeros',()=>{
 for(const bad of [1,1.1,-1n,'1e8','01','1.5','0',null,(1n<<128n)])assert.throws(()=>uint(bad));
 assert.equal(uint('100000000'),100000000n);assert.equal(uint(0n,'zero',true),0n);
});
test('mainnet wallet validation rejects testnet, contract recipients and malformed checksums',()=>{
 assert.equal(walletPrincipal(owner),owner);
 for(const v of ['ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',`${owner}.contract`,owner.slice(0,-1)+'1'])assert.throws(()=>walletPrincipal(v));
});
test('integer slippage rejects zero-output quotes and unreasonable tolerance',()=>{
 assert.equal(minimumOutput(100000n,50),99500n);
 for(const tolerance of [-1,1001,NaN,0.5])assert.throws(()=>minimumOutput(1000n,tolerance));
 assert.throws(()=>minimumOutput(1n,50));
});
test('Zest route binds recipient, exact sBTC debit, deny mode and canonical index tip',async()=>{
 const f=fixture();const state=await f.client.readState('zest-sbtc',owner);const quote=await f.client.quote(state,'deposit','100000');const route=f.client.buildUnsignedRoute(quote,wallet);
 assert.equal(route.transaction.postConditionMode,PostConditionMode.Deny);assert.equal(route.transaction.functionName,'deposit');assert.equal(route.transaction.functionArgs[2].value,owner);assert.equal(route.rules.find(r=>r.asset===`${C.sbtc}::sbtc-token`).amount,100000n);assert.equal(route.approvalRequired,false);
 assert.ok(f.reads.every(u=>u.includes('tip=0x'+'b'.repeat(64))));assert.ok(Object.isFrozen(route.transaction));
});
test('Zest redeem includes exact receipt burn and minimum vault payout',async()=>{
 const {client}=fixture();const route=client.buildUnsignedRoute(await client.quote(await client.readState('zest-sbtc',owner),'redeem',100000n),wallet);
 assert.ok(route.rules.some(r=>r.principal===owner&&r.asset===`${C.zest}::zft`&&r.amount===100000n&&r.condition==='eq'));
 assert.ok(route.rules.some(r=>r.principal===C.zest&&r.asset===`${C.sbtc}::sbtc-token`&&r.condition==='gte'));
});
test('source mismatch and wrong chain fail before any route can be prepared',async()=>{
 await assert.rejects(()=>fixture({sourceMismatch:true}).client.readState('zest-sbtc',owner),/Source mismatch/);
 await assert.rejects(()=>fixture({chainId:0x80000000}).client.readState('zest-sbtc',owner),/chain ID/);
});
test('RPC rejects trailing, truncated, odd-length and malformed Clarity encodings',async()=>{
 for(const malformed of ['0x010000000000000000000000000000000100','0x01','0x0','0xzz',cvToHex(Cl.ok(Cl.uint(1)))+'ff'])await assert.rejects(()=>fixture({malformed}).client.readState('zest-sbtc',owner));
});
test('Zest registry mismatch, pause, cap, liquidity and available-balance failures close routes',async()=>{
 await assert.rejects(()=>fixture({mutate:set=>set(C.zestRegistry,'get-asset-status',ok(Cl.tuple({addr:Cl.principal(C.stbtc)})))}).client.readState('zest-sbtc',owner),/registry/);
 for(const [c,f,v,action,error] of [
  [C.zest,'get-pause-states',ok(Cl.tuple({deposit:b(true),redeem:b(false),accrue:b(false)})),'deposit',/paused/],
  [C.zest,'get-cap-supply',ok(u(1)),'deposit',/cap/],
  [C.zest,'get-available-assets',u(1),'redeem',/liquidity/],
  [C.sbtc,'get-balance-available',ok(u(1)),'deposit',/balance/],
 ]){const {client}=fixture({mutate:set=>set(c,f,v)});await assert.rejects(()=>client.readState('zest-sbtc',owner).then(s=>client.quote(s,action,100000n)),error);}
});
test('expired quotes, foreign-client quotes and wallet changes cannot create plans',async()=>{
 const f=fixture();const state=await f.client.readState('zest-sbtc',owner);const q=await f.client.quote(state,'deposit',100000n);
 assert.throws(()=>f.client.buildUnsignedRoute(q,{...wallet,walletAddress:other}),/changed/);assert.throws(()=>f.client.buildUnsignedRoute(q,{...wallet,network:'testnet'}),/changed/);
 assert.throws(()=>fixture().client.buildUnsignedRoute(q,wallet),/produced by this client/);assert.throws(()=>f.client.buildUnsignedRoute({...q,amount:99999999n},wallet),/produced/);
 f.advance();assert.throws(()=>f.client.buildUnsignedRoute(q,wallet),/expired/);
});
test('StackingDAO quote incorporates rewards that process-rewards will release before minting',async()=>{
 const {client}=fixture();const s=await client.readState('stackingdao-stbtc',owner);assert.equal(s.rates.pendingReserveRewards,1000n);
 const q=await client.quote(s,'deposit',100000n);assert.equal(q.expectedOut,99990n);
 const r=client.buildUnsignedRoute(q,wallet);assert.ok(r.rules.some(x=>x.principal===C.rewards&&x.condition==='lte'&&x.amount===10000n));
});
test('StackingDAO idle exit includes fee and exact receipt burn',async()=>{
 const {client}=fixture();const s=await client.readState('stackingdao-stbtc',owner);const q=await client.quote(s,'redeem',100000n);assert.equal(q.expectedOut,99010n);assert.equal(q.fee,1000n);
 const r=client.buildUnsignedRoute(q,wallet);assert.equal(r.transaction.functionName,'withdraw-idle');assert.ok(r.rules.some(x=>x.asset===`${C.stbtc}::stbtc`&&x.principal===owner&&x.amount===100000n));
});
test('StackingDAO queue refuses an unprotected direct request until guard is deployed and source-pinned',async()=>{
 const {client}=fixture();const q=await client.quote(await client.readState('stackingdao-stbtc',owner),'request',100000n);assert.equal(q.executable,false);assert.throws(()=>client.buildUnsignedRoute(q,wallet),/guard/);
 const yes=fixture({guardEnabled:true}).client;const q2=await yes.quote(await yes.readState('stackingdao-stbtc',owner),'request',100000n);const r=yes.buildUnsignedRoute(q2,wallet);
 assert.equal(r.transaction.contractName,'queue-guard');assert.equal(r.transaction.functionName,'request');assert.equal(r.transaction.functionArgs.length,4);assert.equal(r.receiptOwner,owner);
});
test('StackingDAO rejects unexpected keeper authority and inconsistent backing',async()=>{
 for(const [c,f,v,re] of [[C.rewards,'get-keeper',Cl.some(Cl.principal(C.stackingCore)),/keeper/],[C.ratio,'get-sbtc-per-stbtc',u(999),/reconcile/]])await assert.rejects(()=>fixture({mutate:set=>set(c,f,v)}).client.readState('stackingdao-stbtc',owner),re);
});
test('StackingDAO disabled and illiquid routes fail',async()=>{
 for(const [c,f,v,action,re] of [[C.dao,'get-contract-active',b(false),'deposit',/disables/],[C.reserve,'get-sbtc-balance',u(0),'redeem',/idle/]]){
 const {client}=fixture({mutate:set=>set(c,f,v)});await assert.rejects(()=>client.readState('stackingdao-stbtc',owner).then(s=>client.quote(s,action,100000n)),re);
 }
});
test('claim verifies NFT ownership, lock, recorded fee and reserve before payout plan',async()=>{
 const wrong=fixture({mutate:set=>set(C.nft,'get-owner',ok(Cl.some(Cl.principal(other))))}).client;await assert.rejects(()=>wrong.readState('stackingdao-stbtc',owner).then(s=>wrong.readClaim(s,1n)),/another wallet/);
 const {client}=fixture({mutate:set=>set(C.reserve,'get-sbtc-for-withdrawals',u(100000))});
 // Reserving requires ratio and backing to agree, update live ratios for this observation.
 const f=fixture({mutate:set=>{set(C.reserve,'get-sbtc-for-withdrawals',u(100000));set(C.ratio,'get-sbtc-per-stbtc',u(99000000));set(C.ratio,'get-sbtc-per-stbtc-up',u(99000000));}});
 const q=await f.client.readClaim(await f.client.readState('stackingdao-stbtc',owner),1n);assert.equal(q.executable,true);const route=f.client.buildUnsignedRoute(q,wallet);
 assert.equal(route.transaction.functionName,'withdraw');assert.ok(route.rules.some(r=>r.condition==='sent'&&r.tokenId===1n));assert.ok(route.rules.some(r=>r.principal===C.stackingCore&&r.asset===`${C.stbtc}::stbtc`&&r.amount===99990n));
});
test('mature NFT claims stay available despite broken deposit ratios, active-pool loss and reward keeper changes',async()=>{
 const f=fixture({mutate:set=>{
  set(C.reserve,'get-sbtc-for-withdrawals',u(100000));set(C.reserve,'get-total-sbtc',u(1));
  set(C.ratio,'get-sbtc-per-stbtc',Cl.stringAscii('invalid'));set(C.rewards,'get-keeper',Cl.some(Cl.principal(C.stackingCore)));
 }});
 const state=await f.client.readClaimState(owner);const q=await f.client.readClaim(state,1n);
 assert.equal(q.executable,true);assert.equal(f.client.buildUnsignedRoute(q,wallet).transaction.functionName,'withdraw');
 assert.ok(f.reads.every(url=>!url.includes('/get-sbtc-per-stbtc')&&!url.includes('/get-total-sbtc')&&!url.includes('/get-keeper')));
 await assert.rejects(()=>f.client.quote(state,'deposit',100000n),/Claim observation/);
});
test('claims reject malformed unlock height, zero assets and zero escrow shares',async()=>{
 for(const field of ['unlock-burn-height','asset-amount','token-amount']){
  const f=fixture({mutate:set=>set(C.withdrawals,'get-withdrawals-by-nft',Cl.tuple({'asset-amount':u(100000),'token-amount':u(99990),'withdraw-fee':u(0),'unlock-burn-height':u(100),[field]:u(0)}))});
  await assert.rejects(()=>f.client.readClaimState(owner).then(s=>f.client.readClaim(s,1n)));
 }
 const f=fixture({mutate:set=>set(C.withdrawals,'get-withdrawals-by-nft',Cl.tuple({'asset-amount':u(100000),'token-amount':u(99990),'withdraw-fee':u(0),'unlock-burn-height':Cl.stringAscii('100')}))});
 await assert.rejects(()=>f.client.readClaimState(owner).then(s=>f.client.readClaim(s,1n)));
});
test('event-policy rejects unlisted transfers and absent receipt burns',()=>{
 const route={rules:[{asset:`${C.stbtc}::stbtc`,principal:owner,condition:'eq',amount:10n},{asset:`${C.sbtc}::sbtc-token`,principal:C.reserve,condition:'gte',amount:9n}]};
 const events=[{event:'ft_burn_event',data:{sender:owner,asset_identifier:`${C.stbtc}::stbtc`,amount:'10'}},{event:'ft_transfer_event',data:{sender:C.reserve,recipient:owner,asset_identifier:`${C.sbtc}::sbtc-token`,amount:'9'}}];
 assert.equal(assertEventPolicy(route,events),true);assert.throws(()=>assertEventPolicy(route,events.slice(1)),/violates/);assert.throws(()=>assertEventPolicy(route,[...events,{event:'stx_transfer_event',data:{sender:owner,recipient:other,amount:'1'}}]),/Unlisted/);
});

test('numeric Clarity strings are not accepted as on-chain uint balances or quote output',async()=>{
 await assert.rejects(()=>fixture({mutate:set=>set(C.sbtc,'get-balance-available',ok(Cl.stringAscii('1000000')))}).client.readState('zest-sbtc',owner),/on-chain uint/);
 const {client}=fixture({mutate:set=>set(C.zest,'convert-to-shares',ok(Cl.stringAscii('100000')))});
 await assert.rejects(()=>client.readState('zest-sbtc',owner).then(s=>client.quote(s,'deposit',100000n)),/on-chain quote uint/);
});
test('seeded exact-integer fuzzing keeps minimum output within one base unit of rational tolerance',()=>{
 let seed=0x1412n;const mask=(1n<<128n)-1n;
 for(let i=0;i<2048;i++){
  seed=(seed*6364136223846793005n+1442695040888963407n)&mask;
  const expected=seed+10001n,valid=expected>mask?mask:expected,bps=i%1001;
  const min=minimumOutput(valid,bps),product=valid*BigInt(10000-bps);
  assert.ok(min>0n&&min<=valid);assert.ok(min*10000n<=product);assert.ok((min+1n)*10000n>product);
 }
});
