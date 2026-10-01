import { expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
const owner = simnet.getAccounts().get('deployer')!;
const user = simnet.getAccounts().get('wallet_1')!;
const cp = (name:string) => Cl.contractPrincipal(owner,name);
const call = (fn:string,args:any[]=[],sender=owner) => simnet.callPublicFn('vault-v7',fn,args,sender).result;
function open(asset:string,adapter='mock-sync-v7') {
  call('set-sbtc-token',[cp(asset)]); call('schedule-adapter',[cp(adapter),Cl.bool(false),Cl.uint(50000000)]);
  simnet.mineEmptyBurnBlocks(144); call('apply-adapter',[cp(adapter)]); call('set-global-paused',[Cl.bool(false)]);
  simnet.callPublicFn(asset,'mint',[Cl.uint(10000),Cl.principal(user)],owner);
}
const deposited = () => simnet.callReadOnlyFn('vault-v7','get-total-deposited',[],owner).result;
const position = (adapter='mock-sync-v7') => simnet.callReadOnlyFn('vault-v7','get-position',[Cl.principal(user),cp(adapter)],owner).result;
const balance = (asset:string,who:any) => simnet.callReadOnlyFn(asset,'get-balance',[who],owner).result;
it('rejects a wrong token on both entry and exit without changing the position',()=>{
  open('mock-sbtc');
  expect(call('deposit',[cp('false-token-v7'),cp('mock-sync-v7'),Cl.uint(10000),Cl.uint(1),Cl.uint(500)],user)).toBeErr(Cl.uint(115));
  expect(call('deposit',[cp('mock-sbtc'),cp('mock-sync-v7'),Cl.uint(10000),Cl.uint(1),Cl.uint(500)],user)).toBeOk(Cl.uint(10000));
  expect(call('withdraw',[cp('false-token-v7'),cp('mock-sync-v7'),Cl.uint(0)],user)).toBeErr(Cl.uint(115));
  expect(deposited()).toBeUint(10000);
  expect(call('withdraw',[cp('mock-sbtc'),cp('mock-sync-v7'),Cl.uint(10000)],user)).toBeOk(Cl.uint(10000));
});
it('rejects ok-false transfers on deposits, with complete rollback and reusable lock',()=>{
  open('false-token-v7');
  simnet.callPublicFn('false-token-v7','set-fail-sender',[Cl.some(Cl.principal(user))],owner);
  const deposit = () => call('deposit',[cp('false-token-v7'),cp('mock-sync-v7'),Cl.uint(10000),Cl.uint(1),Cl.uint(500)],user);
  expect(deposit()).toBeErr(Cl.uint(122)); expect(deposited()).toBeUint(0); expect(position()).toBeNone();
  expect(balance('false-token-v7',Cl.principal(user))).toBeOk(Cl.uint(10000));
  simnet.callPublicFn('false-token-v7','set-fail-sender',[Cl.none()],owner);
  expect(deposit()).toBeOk(Cl.uint(10000));
});
it('rolls back the entire redemption when payout token returns ok-false',()=>{
  open('false-token-v7');
  expect(call('deposit',[cp('false-token-v7'),cp('mock-sync-v7'),Cl.uint(10000),Cl.uint(1),Cl.uint(500)],user)).toBeOk(Cl.uint(10000));
  simnet.callPublicFn('false-token-v7','set-fail-sender',[Cl.some(cp('vault-v7'))],owner);
  const withdraw = () => call('withdraw',[cp('false-token-v7'),cp('mock-sync-v7'),Cl.uint(10000)],user);
  expect(withdraw()).toBeErr(Cl.uint(122)); expect(deposited()).toBeUint(10000);
  expect(balance('false-token-v7',cp('mock-sync-v7'))).toBeOk(Cl.uint(10000));
  simnet.callPublicFn('false-token-v7','set-fail-sender',[Cl.none()],owner);
  expect(withdraw()).toBeOk(Cl.uint(10000));
});
it('actively attempting reentrancy is rejected by the Clarity VM and leaves no position or token movement',()=>{
  open('mock-sbtc','callback-sync-v7');
  expect(()=>call('deposit',[cp('mock-sbtc'),cp('callback-sync-v7'),Cl.uint(10000),Cl.uint(1),Cl.uint(500)],user)).toThrow(/CircularReference|circular|reentr/i);
  expect(deposited()).toBeUint(0); expect(position('callback-sync-v7')).toBeNone();
  expect(balance('mock-sbtc',Cl.principal(user))).toBeOk(Cl.uint(10000));
  expect(balance('mock-sbtc',cp('callback-sync-v7'))).toBeOk(Cl.uint(0));
});
