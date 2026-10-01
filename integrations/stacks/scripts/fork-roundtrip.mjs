import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, ClarityVersion, cvToHex, cvToString, hexToCV, Pc } from '@stacks/transactions';
import { CONTRACTS as C, createStacksIntegrationClient, decode, assertEventPolicy } from '../src/index.mjs';
import manifest from '../manifests/mainnet.json' with { type:'json' };
const root=new URL('../',import.meta.url);
const holder='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const amount=100000n;
const evidence={schemaVersion:1,network:'mainnet-fork-only',mainnetWrites:false,initialHeight:9101400,holder,funding:'Existing canonical sBTC balance; no mint or balance override',sdk:'@stacks/clarinet-sdk 3.24.1',postconditions:'Native SDK deny-mode enforcement plus independent event-policy assertions',startedAt:new Date().toISOString(),steps:[]};
const output=new URL('evidence/mainnet-fork.json',root);
const serial=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const sources=new Map();
for(const record of manifest.contracts) {
 const source=await readFile(new URL(record.sourceFile,root),'utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),record.sha256);
 assert.ok(record.publishHeight<=evidence.initialHeight,'Pinned source must have existed at fork height');
 sources.set(record.contract,source);
}
const simnet=await initSimnet(new URL('fork/Clarinet.toml',root).pathname,true);
const ro=(c,f,args=[])=>decode(simnet.callReadOnlyFn(c,f,args,holder).result);
const balance=()=>ro(C.sbtc,'get-balance-available',[Cl.principal(holder)]);
const receipt=c=>ro(c,'get-balance',[Cl.principal(holder)]);
const guardSource=await readFile(new URL('contracts/stackingdao-request-guard-v1.clar',root),'utf8');
const guardName='sy-stbtc-request-guard-v1';const guard=`${holder}.${guardName}`;
const deploy=simnet.deployContract(guardName,guardSource,{clarityVersion:ClarityVersion.Clarity6},holder);
assert.equal(cvToString(deploy.result),'true');sources.set(guard,guardSource);
evidence.guard={contract:guard,scope:'Candidate deployed only in the local fork',sha256:createHash('sha256').update(guardSource).digest('hex')};
const fakeFetch=async(url,init)=>{
 const path=new URL(url).pathname;
 if(path==='/v2/info') return {ok:true,json:async()=>({network_id:1,stacks_tip_height:simnet.blockHeight,burn_block_height:simnet.burnBlockHeight,stacks_tip:'a'.repeat(64)})};
 if(path.startsWith('/extended/v2/blocks/')) return {ok:true,json:async()=>({canonical:true,height:simnet.blockHeight,hash:'0x'+'a'.repeat(64),index_block_hash:'0x'+'b'.repeat(64)})};
 if(path.includes('/contracts/source/')) {const [address,name]=path.split('/').slice(-2);return {ok:true,json:async()=>({source:sources.get(`${address}.${name}`)})};}
 if(path.includes('/call-read/')) {const [address,name,fn]=path.split('/').slice(-3);const body=JSON.parse(init.body);const r=simnet.callReadOnlyFn(`${address}.${name}`,fn,body.arguments.map(hexToCV),body.sender);return {ok:true,json:async()=>({okay:true,result:cvToHex(r.result)})};}
 throw new Error(`Unexpected test transport ${path}`);
};
const client=createStacksIntegrationClient({fetch:fakeFetch,queueGuard:guard});
const ownerArgs={walletAddress:holder,network:'mainnet'};
function execute(route,label) {
 const t=route.transaction;
 const r=simnet.callPublicFn(`${t.contractAddress}.${t.contractName}`,t.functionName,t.functionArgs,holder,{postConditionMode:t.postConditionMode,postConditions:t.postConditions});
 assert.equal(r.result.type,'ok',`${label}: ${cvToString(r.result)}`);
 assertEventPolicy(route,r.events);
 evidence.steps.push({label,result:cvToString(r.result),nativeDenyPostconditionsPassed:true,rules:route.rules,events:r.events.filter(e=>!['print_event','contract_event'].includes(e.event))});
 return decode(r.result);
}
try {
 const initial=balance();assert.ok(initial>amount*4n);evidence.initialSbtc=initial;
 let state=await client.readState('zest-sbtc',holder);const zestSharesBefore=state.receiptBalance;
 let q=await client.quote(state,'deposit',amount);let minted=execute(client.buildUnsignedRoute(q,ownerArgs),'zest:deposit');
 assert.equal(balance(),initial-amount);assert.equal(receipt(C.zest),zestSharesBefore+minted);
 state=await client.readState('zest-sbtc',holder);q=await client.quote(state,'redeem',minted);
 const redeem=client.buildUnsignedRoute(q,ownerArgs);
 // A missing burn guard must be rejected natively and roll back all mutations.
 const beforeRejected={sbtc:balance(),receipt:receipt(C.zest)};
 let denied=false;
 try{simnet.callPublicFn(C.zest,'redeem',redeem.transaction.functionArgs,holder,{postConditionMode:'deny',postConditions:redeem.transaction.postConditions.filter(pc=>pc.asset!==`${C.zest}::zft`)});}
 catch(error){denied=/post.condition/i.test(String(error));}
 if(!denied) throw new Error('Missing burn postcondition did not reject');
 assert.equal(balance(),beforeRejected.sbtc);assert.equal(receipt(C.zest),beforeRejected.receipt);
 evidence.steps.push({label:'zest:missing-burn-guard-rejected',passed:true,rollbackVerified:true});
 const returned=execute(redeem,'zest:redeem');assert.equal(receipt(C.zest),zestSharesBefore);assert.equal(balance(),initial-amount+returned);
 evidence.zest={deposited:amount,shares:minted,returned,roundingLoss:amount-returned};
 // Advance only the local fork to exercise any ready public reward-stream release.
 simnet.mineEmptyBurnBlocks(1);
 state=await client.readState('stackingdao-stbtc',holder);const stbtcBefore=state.receiptBalance;const sbtcBefore=balance();
 q=await client.quote(state,'deposit',amount);minted=execute(client.buildUnsignedRoute(q,ownerArgs),'stackingdao:deposit');
 assert.equal(balance(),sbtcBefore-amount);assert.equal(receipt(C.stbtc),stbtcBefore+minted);
 state=await client.readState('stackingdao-stbtc',holder);q=await client.quote(state,'redeem',minted);
 const paid=execute(client.buildUnsignedRoute(q,ownerArgs),'stackingdao:withdraw-idle');
 assert.equal(receipt(C.stbtc),stbtcBefore);assert.equal(balance(),sbtcBefore-amount+paid['sbtc-user']);
 evidence.stackingIdle={deposited:amount,shares:minted,returned:paid['sbtc-user'],fee:paid['sbtc-fee']};
 state=await client.readState('stackingdao-stbtc',holder);q=await client.quote(state,'deposit',amount);minted=execute(client.buildUnsignedRoute(q,ownerArgs),'stackingdao:deposit-for-queue');
 const queueBefore={sbtc:balance(),receipt:receipt(C.stbtc),reserved:ro(C.reserve,'get-sbtc-for-withdrawals'),pending:ro(C.ratio,'get-pending-shares'),lastNft:ro(C.nft,'get-last-token-id')};
 const bad=simnet.callPublicFn(guard,'request',[Cl.uint(minted),Cl.uint(amount*2n),Cl.uint(9999),Cl.uint(4200)],holder);
 assert.equal(cvToString(bad.result),'(err u9004)');
 assert.deepEqual({sbtc:balance(),receipt:receipt(C.stbtc),reserved:ro(C.reserve,'get-sbtc-for-withdrawals'),pending:ro(C.ratio,'get-pending-shares'),lastNft:ro(C.nft,'get-last-token-id')},queueBefore);
 evidence.steps.push({label:'guard:minimum-entitlement-rejected',result:cvToString(bad.result),rollbackVerified:true});
 state=await client.readState('stackingdao-stbtc',holder);q=await client.quote(state,'request',minted);
 const request=execute(client.buildUnsignedRoute(q,ownerArgs),'guard:request');
 assert.equal(receipt(C.stbtc),stbtcBefore);assert.equal(ro(C.nft,'get-owner',[Cl.uint(request['claim-id'])]),holder);
 assert.equal(ro(C.stbtc,'get-balance',[Cl.principal(guard)]),0n);assert.equal(ro(C.sbtc,'get-balance',[Cl.principal(guard)]),0n);
 let locked=await client.readClaim(await client.readClaimState(holder),request['claim-id']);assert.equal(locked.executable,false);
 assert.throws(()=>client.buildUnsignedRoute(locked,ownerArgs),/paused|locked|liquid/);
 const remaining=request['unlock-burn-height']-BigInt(simnet.burnBlockHeight);assert.ok(remaining>=2099n);simnet.mineEmptyBurnBlocks(Number(remaining));
 const claim=await client.readClaim(await client.readClaimState(holder),request['claim-id']);assert.equal(claim.executable,true);
 const claimPaid=execute(client.buildUnsignedRoute(claim,ownerArgs),'stackingdao:claim');assert.equal(claimPaid['sbtc-user'],request['sbtc-entitlement']);
 assert.equal(ro(C.nft,'get-owner',[Cl.uint(request['claim-id'])]),null);assert.equal(receipt(C.stbtc),stbtcBefore);
 assert.equal(ro(C.reserve,'get-sbtc-for-withdrawals'),queueBefore.reserved);assert.equal(ro(C.ratio,'get-pending-shares'),queueBefore.pending);
 evidence.queue={claimId:request['claim-id'],requestedShares:minted,entitlement:request['sbtc-entitlement'],returned:claimPaid['sbtc-user'],localBurnBlocksWaited:remaining,guardFinalSbtc:ro(C.sbtc,'get-balance',[Cl.principal(guard)]),guardFinalShares:ro(C.stbtc,'get-balance',[Cl.principal(guard)]),nftBurned:true};
 const forwardName='sy-test-forwarder';
 const forward=simnet.deployContract(forwardName,`(define-public (request) (contract-call? '${guard} request u1 u1 u0 u4200))`,{clarityVersion:ClarityVersion.Clarity6},holder);
 assert.equal(cvToString(forward.result),'true');
 const forwarded=simnet.callPublicFn(`${holder}.${forwardName}`,'request',[],holder);
 assert.equal(cvToString(forwarded.result),'(err u9001)');
 evidence.steps.push({label:'guard:forwarded-caller-rejected',result:cvToString(forwarded.result)});
 evidence.finalSbtc=balance();evidence.passed=true;
} catch(error) {evidence.passed=false;evidence.error=String(error);throw error;}
finally {evidence.finishedAt=new Date().toISOString();await writeFile(output,serial(evidence));console.log(serial({passed:evidence.passed,error:evidence.error,steps:evidence.steps.map(s=>s.label),zest:evidence.zest,stackingIdle:evidence.stackingIdle,queue:evidence.queue}));}
