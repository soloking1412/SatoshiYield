import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, ClarityVersion, cvToString } from '@stacks/transactions';
const protocol='SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG';
const user='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const guard=`${user}.request-guard`;
let simnet;
before(async()=>{
 simnet=await initSimnet(new URL('../guard-unit/Clarinet.toml',import.meta.url).pathname,true);
 const deploy=(name,code,sender=protocol)=>assert.equal(cvToString(simnet.deployContract(name,code,{clarityVersion:ClarityVersion.Clarity6},sender).result),'true');
 // These upstream fixtures test only the candidate guard's negative branches.
 // They are not used by the separate funded mainnet-fork integration proof.
 deploy('stacking-dao-core-stbtc-v1','(define-data-var count uint u0) (define-read-only (get-withdraw-fee) u100) (define-read-only (get-count) (var-get count)) (define-public (init-withdraw (shares uint)) (begin (asserts! (> shares u0) (err u1)) (var-set count (+ (var-get count) u1)) (ok u1)))');
 deploy('withdraw-data-stbtc','(define-data-var cooldown uint u4200) (define-public (test-set-cooldown (blocks uint)) (ok (var-set cooldown blocks))) (define-read-only (get-withdraw-cooldown-blocks) (var-get cooldown)) (define-read-only (get-withdrawals-by-nft (id uint)) {asset-amount:u100, token-amount:u1, withdraw-fee:u100, unlock-burn-height:(+ burn-block-height u4200)})');
 deploy('stbtc-withdraw-nft','(define-read-only (get-owner (id uint)) (ok (some tx-sender)))');
 deploy('request-guard',await readFile(new URL('../contracts/stackingdao-request-guard-v1.clar',import.meta.url),'utf8'),user);
 deploy('forwarder',`(define-public (call) (contract-call? '${guard} request u1 u1 u100 u4200))`,user);
});
const call=(shares,min,fee)=>simnet.callPublicFn(guard,'request',[Cl.uint(shares),Cl.uint(min),Cl.uint(fee),Cl.uint(4200)],user).result;
const count=()=>cvToString(simnet.callReadOnlyFn(`${protocol}.stacking-dao-core-stbtc-v1`,'get-count',[],user).result);
test('exact guard rejects a fee above the signed cap before touching upstream request state',()=>{
 assert.equal(cvToString(call(1,99,99)),'(err u9003)');assert.equal(count(),'u0');
});
test('exact guard reverts a nested successful request when resulting entitlement is below minimum',()=>{
 assert.equal(cvToString(call(1,100,100)),'(err u9004)');assert.equal(count(),'u0');
});
test('exact guard rejects forwarded user authority and invalid inputs',()=>{
 assert.equal(cvToString(simnet.callPublicFn(`${user}.forwarder`,'call',[],user).result),'(err u9001)');
 for(const args of [[0,1,100],[1,0,100],[1,1,10000]])assert.equal(cvToString(call(...args)),'(err u9002)');assert.equal(count(),'u0');
});
test('exact guard accepts the actual entitlement at the allowed fee and preserves original owner',()=>{
 assert.equal(call(1,99,100).type,'ok');assert.equal(count(),'u1');
});

test('exact guard rejects an upstream cooldown above user consent before requesting',()=>{
 const before=count();
 simnet.callPublicFn(`${protocol}.withdraw-data-stbtc`,'test-set-cooldown',[Cl.uint(4201)],user);
 assert.equal(cvToString(call(1,99,100)),'(err u9007)');assert.equal(count(),before);
 simnet.callPublicFn(`${protocol}.withdraw-data-stbtc`,'test-set-cooldown',[Cl.uint(4200)],user);
});
test('exact guard rolls back a request whose persisted unlock exceeds the quoted duration',()=>{
 const before=count();
 simnet.callPublicFn(`${protocol}.withdraw-data-stbtc`,'test-set-cooldown',[Cl.uint(2100)],user);
 const result=simnet.callPublicFn(guard,'request',[Cl.uint(1),Cl.uint(99),Cl.uint(100),Cl.uint(2100)],user).result;
 assert.equal(cvToString(result),'(err u9007)');assert.equal(count(),before);
 simnet.callPublicFn(`${protocol}.withdraw-data-stbtc`,'test-set-cooldown',[Cl.uint(4200)],user);
});
test('seeded guard fuzzing preserves atomic rollback across 128 fee, entitlement and wait bounds',()=>{
 let seed=0x53a7;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let i=0;i<128;i++){
  const minimum=1+next()%150,feeCap=next()%201,duration=1+next()%5000;
  const before=BigInt(count().slice(1));
  const result=simnet.callPublicFn(guard,'request',[Cl.uint(1),Cl.uint(minimum),Cl.uint(feeCap),Cl.uint(duration)],user).result;
  const error=feeCap<100?9003:duration<4200?9007:minimum>99?9004:null;
  if(error===null){assert.equal(result.type,'ok');assert.equal(BigInt(count().slice(1)),before+1n);}
  else{assert.equal(cvToString(result),`(err u${error})`);assert.equal(BigInt(count().slice(1)),before);}
 }
});
