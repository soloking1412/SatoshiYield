import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initSimnet} from '@stacks/clarinet-sdk';
import {Cl,ClarityVersion,cvToString,Pc} from '@stacks/transactions';
const root=new URL('../../../',import.meta.url), here=new URL('../',import.meta.url);
const H='SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D';
const SBTC='SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const UP=H+'.vault-hbtc-v1-2',STATE=H+'.state-hbtc-v1',HQ=H+'.hq-v1',HBTC=H+'.token-hbtc',RESERVE=H+'.reserve-hbtc-v1';
const holder='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2',stranger='SP000000000000000000002Q6VF78';
const VAULT=holder+'.vault-v7',ADAPTER=holder+'.hermetica-hbtc-adapter-v7';
const amount=100000n;
const evidence={network:'mainnet-fork-only',mainnetWrites:false,pinnedHeight:9101467,initialEpoch:'4.0',sdk:'@stacks/clarinet-sdk 3.24.1',startedAt:new Date().toISOString(),holder,scope:'Exact candidate v7/adaptor sources with remote canonical sBTC and real immutable Hermetica contracts. Governance modifications and elapsed time are local fork only.',steps:[],sources:[],localGovernanceChanges:[]};
const serial=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
function decode(cv){switch(cv.type){case 'ok':case 'some':return decode(cv.value);case 'uint':return BigInt(cv.value);case 'true':return true;case 'false':return false;case 'none':return null;case 'address':case 'contract':return cv.value;case 'tuple':return Object.fromEntries(Object.entries(cv.value).map(([k,v])=>[k,decode(v)]));default:throw new Error('Unexpected CV '+cvToString(cv));}}
const simnet=await initSimnet(new URL('fork/Clarinet.toml',here).pathname,true);
const ro=(c,f,args=[])=>decode(simnet.callReadOnlyFn(c,f,args,holder).result);
const balance=who=>ro(SBTC,'get-balance',[Cl.principal(who)]);
const sbtcPc=(who,n)=>Pc.principal(who).willSendEq(n).ft(SBTC,'sbtc-token');
const hbtcPc=(who,n)=>Pc.principal(who).willSendEq(n).ft(HBTC,'hBTC');
function execute(c,f,args=[],sender=holder,pcs=[]){const r=simnet.callPublicFn(c,f,args,sender,{postConditionMode:'deny',postConditions:pcs});assert.equal(r.result.type,'ok',`${c}.${f} ${cvToString(r.result)}`);evidence.steps.push({contract:c,function:f,sender,result:cvToString(r.result),nativeDenyPostconditionsPassed:true,events:r.events.filter(e=>!['print_event','contract_event'].includes(e.event))});return decode(r.result);}
try{
 for(const name of ['sip-010-trait','yield-source-v2','yield-source-async-v1','vault-v7','hermetica-hbtc-adapter-v7']){
  const file=['sip-010-trait','yield-source-v2','yield-source-async-v1'].includes(name)?'contracts/contracts/traits/'+name+'.clar':name==='vault-v7'?'contracts/contracts/vault-v7.clar':'contracts/contracts/adapters/'+name+'.clar';
  const source=await readFile(new URL(file,root),'utf8');
  evidence.sources.push({file,sha256:createHash('sha256').update(source).digest('hex')});
  const result=simnet.deployContract(name,source,{clarityVersion:ClarityVersion.Clarity3},holder);
  assert.ok(['true','(ok true)'].includes(cvToString(result.result)),name+': '+cvToString(result.result));
 }
 const initial=balance(holder);assert.ok(initial>=amount);evidence.initialSbtc=initial;
 const owner=ro(HQ,'get-owner');assert.equal(owner,'SMJSVT0J9K2DKM8QWXSHXPVTYPJBV4CC5P1ZXAW0');
 assert.equal(ro(STATE,'get-deposit-enabled'),false);evidence.canonicalDepositEnabled=false;
 assert.equal(ro(HQ,'get-protocol',[Cl.principal(UP)]),true);
 execute(VAULT,'set-sbtc-token',[Cl.principal(SBTC)]);
 execute(VAULT,'schedule-adapter',[Cl.principal(ADAPTER),Cl.bool(true),Cl.uint(amount*10n)]);
 simnet.mineEmptyBurnBlocks(144);
 execute(VAULT,'apply-adapter',[Cl.principal(ADAPTER)]);
 execute(VAULT,'set-global-paused',[Cl.bool(false)]);
 execute(ADAPTER,'set-paused',[Cl.bool(false)]);
 execute(ADAPTER,'set-oracle-at',[Cl.uint(0),Cl.principal(holder)]);
 execute(ADAPTER,'set-oracle-at',[Cl.uint(1),Cl.principal(stranger)]);
 execute(ADAPTER,'set-apy',[Cl.uint(100)],holder);execute(ADAPTER,'set-apy',[Cl.uint(100)],stranger);
 assert.equal(ro(ADAPTER,'is-paused'),true);
 const depositArgs=[Cl.principal(SBTC),Cl.principal(ADAPTER),Cl.uint(amount),Cl.uint(1),Cl.uint(500)];
 const blocked=simnet.callPublicFn(VAULT,'deposit-async',depositArgs,holder);
 assert.equal(blocked.result.type,'err');assert.equal(balance(holder),initial);assert.equal(ro(VAULT,'get-total-deposited'),0n);
 evidence.steps.push({label:'canonical-upstream-paused-deposit-rejected',result:cvToString(blocked.result),rollbackVerified:true});
 // Scenario-only governance action. This is NOT evidence that deposits are live.
 execute(STATE,'set-deposit-enabled',[Cl.bool(true)],owner);evidence.localGovernanceChanges.push('Real owner impersonated locally to enable deposits for lifecycle verification; public network remains disabled.');
 assert.equal(ro(ADAPTER,'is-paused'),false);
 execute(VAULT,'deposit-async',depositArgs,holder,[sbtcPc(holder,amount),sbtcPc(VAULT,0n),sbtcPc(ADAPTER,amount)]);
 assert.equal(balance(holder),initial-amount);const shares=ro(ADAPTER,'get-shares',[Cl.principal(holder)]);assert.ok(shares>0n);
 assert.equal(balance(ADAPTER),0n);
 execute(VAULT,'request-withdraw',[Cl.principal(ADAPTER)],holder,[hbtcPc(ADAPTER,shares)]);
 execute(VAULT,'cancel-withdraw',[Cl.principal(ADAPTER)],holder,[hbtcPc(UP,shares)]);
 execute(VAULT,'request-withdraw',[Cl.principal(ADAPTER)],holder,[hbtcPc(ADAPTER,shares)]);
 const id=ro(ADAPTER,'get-claim-id',[Cl.principal(holder)]);const claim=ro(UP,'get-claim',[Cl.uint(id)]);
 const premature=simnet.callPublicFn(ADAPTER,'settle-pending',[],stranger);
 assert.equal(premature.result.type,'err');assert.equal(ro(ADAPTER,'get-receipt',[Cl.principal(holder)]),null);
 evidence.steps.push({label:'premature-settlement-rejected',result:cvToString(premature.result),rollbackVerified:true});
 // Mine local Bitcoin blocks until the real timestamp-based Hermetica cooldown passes.
 const timeBefore=simnet.runSnippet('stacks-block-time');simnet.mineEmptyBurnBlocks(435);const timeAfter=simnet.runSnippet('stacks-block-time');
 evidence.cooldown={realContractSeconds:ro(STATE,'get-cooldown'),claimTimestamp:claim.ts,localBurnBlocksMined:435,timeBefore,timeAfter};
 const assets=ro(UP,'preview-redeem',[Cl.uint(shares)]);
 execute(UP,'fund-claim',[Cl.uint(id)],stranger,[sbtcPc(RESERVE,assets),hbtcPc(UP,shares)]);
 const funded=ro(UP,'get-claim',[Cl.uint(id)]);const paid=funded.assets-funded.fee;
 execute(UP,'redeem',[Cl.uint(id)],stranger,[sbtcPc(UP,funded.assets)]);
 assert.equal(simnet.callReadOnlyFn(UP,'get-claim',[Cl.uint(id)],holder).result.type,'err');assert.equal(balance(ADAPTER),paid);
 assert.equal(execute(ADAPTER,'settle-pending',[],stranger),paid);assert.equal(ro(ADAPTER,'get-receipt',[Cl.principal(holder)]),paid);
 const wrong=simnet.callPublicFn(VAULT,'claim-withdraw',[Cl.principal(SBTC),Cl.principal(ADAPTER),Cl.uint(paid+1n)],holder);
 assert.equal(wrong.result.type,'err');assert.equal(ro(ADAPTER,'get-receipt',[Cl.principal(holder)]),paid);assert.equal(balance(holder),initial-amount);
 evidence.steps.push({label:'minimum-payout-rejected-after-stranger-redeem',result:cvToString(wrong.result),rollbackVerified:true});
 const vaultFee=paid>amount?(paid-amount)*500n/10000n:0n;const net=paid-vaultFee;
 execute(VAULT,'claim-withdraw',[Cl.principal(SBTC),Cl.principal(ADAPTER),Cl.uint(net)],holder,[sbtcPc(ADAPTER,paid),sbtcPc(VAULT,net)]);
 assert.equal(balance(holder),initial-amount+net);assert.equal(ro(ADAPTER,'get-receipt-liability'),0n);assert.equal(ro(VAULT,'get-total-deposited'),0n);assert.equal(ro(VAULT,'get-position',[Cl.principal(holder),Cl.principal(ADAPTER)]),null);
 evidence.roundTrip={amount,shares,upstreamPaid:paid,vaultFee,net,finalSbtc:balance(holder),thirdPartyDeletionRecovered:true};evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error=String(error);throw error;}
finally{evidence.finishedAt=new Date().toISOString();await writeFile(new URL('evidence/mainnet-fork.json',here),serial(evidence));console.log(serial({passed:evidence.passed,error:evidence.error,steps:evidence.steps.map(s=>s.label??s.function),roundTrip:evidence.roundTrip,cooldown:evidence.cooldown}));}
