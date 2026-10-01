import { beforeEach, describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
const accounts = simnet.getAccounts();
const owner = accounts.get('deployer')!;
const reporters = [accounts.get('wallet_1')!,accounts.get('wallet_2')!,accounts.get('wallet_3')!];
const replacement = accounts.get('wallet_4')!;
const adapter = 'zest-earn-adapter-v7';
const call = (fn:string,args:any[]=[],sender=owner) => simnet.callPublicFn(adapter,fn,args,sender).result;
const apy = () => simnet.callReadOnlyFn(adapter,'get-apy',[],owner).result;
beforeEach(()=>reporters.forEach((who,i)=>call('set-oracle-at',[Cl.uint(i),Cl.principal(who)])));
describe('Zest v7 candidate oracle unit tests (not protocol fork validation)',()=>{
  it('starts paused and rejects unset or single-source APY',()=>{
    expect(simnet.callReadOnlyFn(adapter,'is-paused',[],owner).result).toBeOk(Cl.bool(true));
    expect(apy()).toBeErr(Cl.uint(107));
    expect(call('set-apy',[Cl.uint(400)],reporters[0])).toBeOk(Cl.uint(0));
    expect(apy()).toBeErr(Cl.uint(107));
    call('set-apy',[Cl.uint(400)],reporters[1]); expect(apy()).toBeOk(Cl.uint(400));
  });
  it('does not permit a single signer to occupy two oracle slots',()=>{
    expect(call('set-oracle-at',[Cl.uint(1),Cl.principal(reporters[0])])).toBeErr(Cl.uint(123));
  });
  it('invalidates reports and APY freshness when a signer is replaced',()=>{
    call('set-apy',[Cl.uint(400)],reporters[0]);call('set-apy',[Cl.uint(400)],reporters[1]);
    expect(apy()).toBeOk(Cl.uint(400));
    call('set-oracle-at',[Cl.uint(0),Cl.principal(replacement)]);
    expect(apy()).toBeErr(Cl.uint(107));
    call('set-apy',[Cl.uint(400)],reporters[2]);expect(apy()).toBeOk(Cl.uint(400));
    expect(call('set-apy',[Cl.uint(400)],reporters[0])).toBeErr(Cl.uint(100));
  });
  it('third oracle cannot refresh an old agreeing pair beyond the pair freshness',()=>{
    call('set-apy',[Cl.uint(400)],reporters[0]);call('set-apy',[Cl.uint(400)],reporters[1]);
    simnet.mineEmptyBurnBlocks(140);
    call('set-apy',[Cl.uint(550)],reporters[2]); // valid deviation, outside agreement tolerance
    simnet.mineEmptyBurnBlocks(5);
    expect(apy()).toBeErr(Cl.uint(107));
  });
  it('binds permanently to the v7 vault principal and rejects foreign vaults',()=>{
    expect(call('set-vault',[Cl.principal(reporters[0])])).toBeErr(Cl.uint(103));
    const vault=Cl.contractPrincipal(owner,'vault-v7');
    expect(call('set-vault',[vault])).toBeOk(vault);
    expect(call('set-vault',[vault])).toBeErr(Cl.uint(105));
    expect(call('set-paused',[Cl.bool(false)],reporters[0])).toBeErr(Cl.uint(100));
  });
});
