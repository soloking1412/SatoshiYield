import { beforeEach, describe, expect, it } from 'vitest';
import { Cl, type ClarityValue } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const owner = accounts.get('deployer')!;
const users = [accounts.get('wallet_1')!, accounts.get('wallet_2')!, accounts.get('wallet_3')!];
const outsider = accounts.get('wallet_4')!;
const adapter = 'hermetica-hbtc-adapter-v7';
const upstream = 'mock-hermetica-upstream-v7';
const governor = 'SMJSVT0J9K2DKM8QWXSHXPVTYPJBV4CC5P1ZXAW0';
const cp = (name: string) => Cl.contractPrincipal(owner,name);
const addr = (name: string) => `${owner}.${name}`;
const call = (name: string, fn: string, args: ClarityValue[] = [], sender = owner) => simnet.callPublicFn(name,fn,args,sender).result;
const read = (name: string, fn: string, args: ClarityValue[] = []) => simnet.callReadOnlyFn(name,fn,args,owner).result;
const n = (v: any): bigint => BigInt(v.value);
const balance = (who: string) => n((read('mock-sbtc','get-balance',[Cl.principal(who)]) as any).value);
const mint = (amount: bigint, who: string) => expect(call('mock-sbtc','mint',[Cl.uint(amount),Cl.principal(who)])).toBeOk(Cl.bool(true));
const dep = (amount = 10000n, user = users[0]) => call('vault-v7','deposit-async',[cp('mock-sbtc'),cp(adapter),Cl.uint(amount),Cl.uint(1),Cl.uint(500)],user);
const req = (user = users[0]) => call('vault-v7','request-withdraw',[cp(adapter)],user);
const cancel = (user = users[0]) => call('vault-v7','cancel-withdraw',[cp(adapter)],user);
const claim = (user = users[0], minimum = 0n) => call('vault-v7','claim-withdraw',[cp('mock-sbtc'),cp(adapter),Cl.uint(minimum)],user);
const quote = (user = users[0]) => read(adapter,'preview-withdraw',[Cl.principal(user)]);
const receipt = (user = users[0]) => read(adapter,'get-receipt',[Cl.principal(user)]);
const settle = () => call(adapter,'settle-pending',[],outsider);
const configure = (price = 100000000n, cooldown = 0n, redeem = true, request = true, funding = true, blacklist = false) =>
  expect(call(upstream,'configure',[Cl.uint(price),Cl.uint(cooldown),Cl.bool(redeem),Cl.bool(request),Cl.bool(funding),Cl.bool(blacklist)])).toBeOk(Cl.bool(true));
const fee = (bps: bigint, deposits = true) => expect(call('mock-hermetica-state-v7','configure',[Cl.bool(deposits),Cl.bool(true),Cl.uint(bps)])).toBeOk(Cl.bool(true));
const externalRedeem = (id: bigint) => {
  expect(call(upstream,'fund-claim',[Cl.uint(id)],outsider)).toBeOk(expect.anything());
  return call(upstream,'redeem',[Cl.uint(id)],outsider);
};
function accounting(expectedFree?: bigint) {
  const result: any = read(adapter,'get-accounting');
  expect(result.type).toBe('ok');
  const data = result.value.value;
  const liabilities = users.reduce((sum,user) => { const r: any=receipt(user);return sum+(r.type==='some'?n(r.value):0n); },0n);
  expect(n(data.balance)).toBe(balance(addr(adapter)));
  expect(n(data.liability)).toBe(liabilities);
  expect(n(data.free)).toBe(n(data.balance)-liabilities);
  expect(n(data.free)).toBeGreaterThanOrEqual(0n);
  if(expectedFree!==undefined) expect(n(data.free)).toBe(expectedFree);
  const sum = [...users,outsider,owner,addr(adapter),addr(upstream),addr('vault-v7')].reduce((s,p)=>s+balance(p),0n);
  expect(sum).toBe(n((read('mock-sbtc','get-total-supply') as any).value));
}
function refresh() {
  call(adapter,'set-apy',[Cl.uint(300)],users[0]);
  call(adapter,'set-apy',[Cl.uint(300)],users[1]);
}
beforeEach(() => {
  expect(call('vault-v7','set-sbtc-token',[cp('mock-sbtc')])).toBeOk(cp('mock-sbtc'));
  call('vault-v7','schedule-adapter',[cp(adapter),Cl.bool(true),Cl.uint(50000000)]);
  simnet.mineEmptyBurnBlocks(144);
  expect(call('vault-v7','apply-adapter',[cp(adapter)],outsider)).toBeOk(Cl.bool(true));
  call('vault-v7','set-global-paused',[Cl.bool(false)]);
  for(let i=0;i<3;i++) call(adapter,'set-oracle-at',[Cl.uint(i),Cl.principal(users[i])]);
  refresh(); call(adapter,'set-paused',[Cl.bool(false)]);
  for(const user of users) mint(1000000n,user);
});

describe('Hermetica v7 singleton redemption and durable receipts', () => {
  it('blocks direct calls, restricts admin and never exposes a sweep', () => {
    expect(call(adapter,'deposit',[Cl.uint(1000),Cl.principal(users[0])],users[0])).toBeErr(Cl.uint(103));
    expect(call(adapter,'request-withdraw',[Cl.uint(1000),Cl.principal(users[0])],users[0])).toBeErr(Cl.uint(103));
    expect(call(adapter,'claim-withdraw',[Cl.uint(1000),Cl.principal(users[0]),cp('mock-sbtc')],users[0])).toBeErr(Cl.uint(103));
    expect(call(adapter,'cancel-withdraw',[Cl.uint(1000),Cl.principal(users[0])],users[0])).toBeErr(Cl.uint(103));
    expect(call(adapter,'set-paused',[Cl.bool(true)],users[0])).toBeErr(Cl.uint(100));
    expect(settle()).toBeErr(Cl.uint(121)); accounting(0n);
  });
  it('uses the real raw preview ABI, returns true shares and pays actual tokens', () => {
    configure(125000000n);
    expect(read(adapter,'preview-deposit',[Cl.uint(10000)])).toBeOk(Cl.uint(8000));
    expect(dep()).toBeOk(Cl.uint(8000)); expect(quote()).toBeOk(Cl.uint(10000));
    expect(req()).toBeOk(Cl.uint(1)); expect(claim(users[0],10000n)).toBeOk(Cl.uint(10000));
    expect(balance(users[0])).toBe(1000000n); accounting(0n);
    expect(claim()).toBeErr(Cl.uint(105)); expect(receipt()).toBeNone();
  });
  it('recovers H01 after a third party redeems and deletes the upstream claim', () => {
    dep(); req();
    expect(externalRedeem(1n)).toBeOk(Cl.uint(10000));
    expect(read(upstream,'get-claim',[Cl.uint(1)])).toBeErr(Cl.uint(103003));
    expect(quote()).toBeOk(Cl.uint(10000));
    expect(settle()).toBeOk(Cl.uint(10000)); expect(receipt()).toBeSome(Cl.uint(10000));
    expect(quote()).toBeOk(Cl.uint(10000)); accounting(0n);
    expect(claim()).toBeOk(Cl.uint(10000)); accounting(0n);
    expect(settle()).toBeErr(Cl.uint(121));
  });
  it('blocks new deposits and second requests until permissionless queue settlement', () => {
    dep(); dep(20000n,users[1]); req();
    expect(req(users[1])).toBeErr(Cl.uint(130));
    expect(dep(10000n,users[2])).toBeErr(Cl.uint(101));
    expect(settle()).toBeOk(Cl.uint(10000));
    expect(dep(10000n,users[2])).toBeOk(Cl.uint(10000));
    expect(req(users[1])).toBeOk(Cl.uint(2));
    expect(claim(users[0])).toBeOk(Cl.uint(10000)); accounting(0n);
    expect(settle()).toBeOk(Cl.uint(20000)); expect(claim(users[1])).toBeOk(Cl.uint(20000)); accounting(0n);
  });
  it('excludes baseline donations and credits only donations during the singleton request', () => {
    mint(777n,addr(adapter)); dep(); req();
    mint(123n,addr(adapter)); expect(quote()).toBeOk(Cl.uint(10123));
    expect(settle()).toBeOk(Cl.uint(10123)); accounting(777n);
    expect(claim()).toBeOk(Cl.uint(10117)); // vault's floor fee: 123 profit * 5% = 6
    expect(balance(addr(adapter))).toBe(777n); accounting(777n);
    dep(10000n,users[1]); req(users[1]); settle(); claim(users[1]); accounting(777n);
  });
  it('paying credited A while B is pending leaves B baseline and donation entitlement intact', () => {
    mint(123n,addr(adapter)); dep(); dep(20000n,users[1]); req(); settle();
    expect(req(users[1])).toBeOk(Cl.uint(2)); mint(50n,addr(adapter));
    expect(claim()).toBeOk(Cl.uint(10000)); accounting(173n);
    expect(externalRedeem(2n)).toBeOk(Cl.uint(20000));
    expect(quote(users[1])).toBeOk(Cl.uint(20050));
    expect(settle()).toBeOk(Cl.uint(20050)); accounting(123n);
    expect(claim(users[1])).toBeOk(Cl.uint(20048)); accounting(123n);
  });
  it('outsiders cannot cancel; authorized cancellation restores shares and locks intervening donations into baseline', () => {
    dep(); req(); mint(44n,addr(adapter));
    expect(call(upstream,'cancel-redeem',[Cl.uint(1)],outsider)).toBeErr(Cl.uint(103008));
    expect(cancel(users[1])).toBeErr(Cl.uint(105));
    expect(cancel()).toBeOk(Cl.bool(true)); accounting(44n);
    expect(read(adapter,'get-shares',[Cl.principal(users[0])])).toBeUint(10000);
    expect(req()).toBeOk(Cl.uint(2)); expect(claim()).toBeOk(Cl.uint(10000)); accounting(44n);
  });
  it('cannot cancel funded or externally redeemed claims and preserves the recoverable receipt', () => {
    dep(); req(); call(upstream,'fund-claim',[Cl.uint(1)],outsider);
    expect(cancel()).toBeErr(Cl.uint(103005));
    call(upstream,'redeem',[Cl.uint(1)],outsider);
    expect(cancel()).toBeErr(Cl.uint(103003));
    expect(settle()).toBeOk(Cl.uint(10000));
    expect(cancel()).toBeErr(Cl.uint(134)); expect(claim()).toBeOk(Cl.uint(10000)); accounting(0n);
  });
  it('snapshots upstream exit fees and vault fees separately while using funded immutable assets', () => {
    fee(100n); dep(); req(); configure(120000000n); mint(2000n,addr(upstream));
    expect(quote()).toBeOk(Cl.uint(11880));
    call(upstream,'fund-claim',[Cl.uint(1)],outsider);
    fee(0n); configure(50000000n); // price/fee changes do not alter funded claim
    expect(quote()).toBeOk(Cl.uint(11880));
    expect(claim(users[0],11787n)).toBeErr(Cl.uint(123));
    expect(claim(users[0],11786n)).toBeOk(Cl.uint(11786));
    expect(balance(owner)).toBe(120n); expect(balance(addr('vault-v7'))).toBe(94n); accounting(0n);
  });
  it('rolls minimum payout failures back without losing upstream claim or locking settlement', () => {
    dep(); req(); configure(80000000n); call(upstream,'slash',[Cl.uint(2000)]);
    expect(quote()).toBeOk(Cl.uint(8000));
    expect(claim(users[0],10000n)).toBeErr(Cl.uint(123));
    expect(receipt()).toBeNone(); expect(read(upstream,'get-claim',[Cl.uint(1)])).toBeOk(expect.anything());
    expect(settle()).toBeOk(Cl.uint(8000));
    expect(claim(users[0],8001n)).toBeErr(Cl.uint(123)); expect(receipt()).toBeSome(Cl.uint(8000));
    expect(claim(users[0],8000n)).toBeOk(Cl.uint(8000)); accounting(0n);
  });
  it('does not mistake zero-price unredeemable upstream claims for missing/redeemed claims', () => {
    dep(); req(); configure(0n); call(upstream,'slash',[Cl.uint(10000)]);
    expect(quote()).toBeOk(Cl.uint(0));
    expect(settle()).toBeErr(Cl.uint(103002)); expect(claim()).toBeErr(Cl.uint(103002));
    expect(receipt()).toBeNone(); expect(read(adapter,'get-pending')).toBeSome(expect.anything());
    expect(cancel()).toBeOk(Cl.bool(true)); accounting(0n); // cancellation restores worthless shares, not principal
  });
  it('propagates unexpected read errors instead of falsely closing a claim as zero', () => {
    dep(); req(); call(upstream,'set-errors',[Cl.uint(999999),Cl.bool(false)]);
    expect(quote()).toBeErr(Cl.uint(999999)); expect(settle()).toBeErr(Cl.uint(999999));
    expect(receipt()).toBeNone();
    call(upstream,'set-errors',[Cl.uint(0),Cl.bool(false)]); expect(claim()).toBeOk(Cl.uint(10000)); accounting(0n);
  });
  it('rejects inconsistent returned payout and rolls back upstream redemption', () => {
    dep(); req(); call(upstream,'set-errors',[Cl.uint(0),Cl.bool(true)]);
    expect(settle()).toBeErr(Cl.uint(131)); expect(balance(addr(adapter))).toBe(0n);
    expect(read(upstream,'get-claim',[Cl.uint(1)])).toBeOk(expect.anything());
    call(upstream,'set-errors',[Cl.uint(0),Cl.bool(false)]); expect(claim()).toBeOk(Cl.uint(10000)); accounting(0n);
  });
  it('preserves pending claims during cooldown, unavailable liquidity, pause and blacklist', () => {
    configure(100000000n,10n); dep(); req();
    expect(settle()).toBeErr(Cl.uint(103004)); simnet.mineEmptyBurnBlocks(10);
    configure(100000000n,0n,true,true,false); expect(settle()).toBeErr(Cl.uint(103009));
    configure(100000000n,0n,false); expect(settle()).toBeErr(Cl.uint(103009));
    configure(100000000n,0n,true,true,true,true); expect(settle()).toBeErr(Cl.uint(103009));
    expect(cancel()).toBeErr(Cl.uint(103009)); expect(receipt()).toBeNone();
    configure(); call(upstream,'slash',[Cl.uint(1)]); expect(settle()).toBeErr(Cl.uint(103012));
    mint(1n,addr(upstream)); expect(claim()).toBeOk(Cl.uint(10000)); accounting(0n);
  });
  it('blocks deposits on real admission switches and governance drift while keeping exits available', () => {
    dep(); fee(0n,false); expect(dep(10000n,users[1])).toBeErr(Cl.uint(101));
    fee(0n); call('mock-hermetica-hq-v7','configure',[Cl.principal(users[2]),Cl.bool(true),Cl.bool(true)]);
    expect(dep(10000n,users[1])).toBeErr(Cl.uint(101));
    req(); expect(claim()).toBeOk(Cl.uint(10000));
    call('mock-hermetica-hq-v7','configure',[Cl.principal(governor),Cl.bool(false),Cl.bool(true)]);
    expect(dep()).toBeErr(Cl.uint(101));
    call('mock-hermetica-hq-v7','configure',[Cl.principal(governor),Cl.bool(true),Cl.bool(false)]);
    expect(dep()).toBeErr(Cl.uint(101)); accounting(0n);
  });
  it('allows existing exits when adapter and vault pause, approval revokes, and APY expires', () => {
    dep(); req(); call(adapter,'set-paused',[Cl.bool(true)]); call('vault-v7','set-global-paused',[Cl.bool(true)]);
    call('vault-v7','revoke-adapter',[cp(adapter)]); simnet.mineEmptyBurnBlocks(145);
    expect(read(adapter,'get-apy')).toBeErr(Cl.uint(107));
    expect(claim()).toBeOk(Cl.uint(10000)); accounting(0n);
  });
});

// Seeded state-machine test. Entitlements are derived independently from share price,
// request fee, donation timing and actual lifecycle; every step asserts asset conservation.
describe('Hermetica interleaving properties', () => {
  for (const seed of [0x12345678,0x87654321,0xdeadbeef]) it(`preserves solvency/attribution through 200 actions, seed ${seed}`, () => {
    let rng=seed>>>0; const next=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;};
    const executed=Array(8).fill(0);
    type Position={amount:bigint,shares:bigint,phase:'active'|'pending'|'receipt',id?:bigint,credit?:bigint,donations:bigint};
    const positions=new Map<string,Position>(); let pending:string|undefined; let id=0n; let price=100000000n;
    for(let step=0;step<200;step++) {
      const who=users[next()%users.length]; const action=next()%8; const p=positions.get(who);
      if(action===0 && !p && !pending) {
        const amount=BigInt(1000+(next()%9000)); const shares=amount*100000000n/price;
        executed[action]++; expect(dep(amount,who)).toBeOk(Cl.uint(shares)); positions.set(who,{amount,shares,phase:'active',donations:0n});
      } else if(action===1 && p?.phase==='active' && !pending) {
        executed[action]++; expect(req(who)).toBeOk(Cl.uint(++id)); p.phase='pending';p.id=id;p.donations=0n;pending=who;
      } else if(action===2 && pending) {
        executed[action]++; const q=positions.get(pending)!; const gross=q.shares*price/100000000n;
        mint(gross,addr(upstream)); // explicit modeled strategy yield/liquidity; counted in supply
        expect(externalRedeem(q.id!)).toBeOk(Cl.uint(gross));
        q.credit=gross+q.donations; expect(quote(pending)).toBeOk(Cl.uint(q.credit));
        expect(settle()).toBeOk(Cl.uint(q.credit)); q.phase='receipt';pending=undefined;
      } else if(action===3 && p?.phase==='receipt') {
        executed[action]++; const profit=p.credit!>p.amount?p.credit!-p.amount:0n;const net=p.credit!-profit*500n/10000n;
        expect(claim(who,net+1n)).toBeErr(Cl.uint(123));
        expect(claim(who,net)).toBeOk(Cl.uint(net));positions.delete(who);
      } else if(action===4 && p?.phase==='pending') {
        executed[action]++; expect(cancel(who)).toBeOk(Cl.bool(true));p.phase='active';p.donations=0n;pending=undefined;
      } else if(action===5) {
        executed[action]++; const amount=BigInt(1+next()%100);mint(amount,addr(adapter));
        if(pending) positions.get(pending)!.donations+=amount;
      } else if(action===6) {
        executed[action]++; price=BigInt(50+next()%101)*1000000n;configure(price);
      } else if(action===7 && pending) {
        executed[action]++; call(upstream,'set-errors',[Cl.uint(999999),Cl.bool(false)]);
        expect(settle()).toBeErr(Cl.uint(999999));call(upstream,'set-errors',[Cl.uint(0),Cl.bool(false)]);
      }
      for(const [user,entry] of positions) {
        if(entry.phase==='receipt') expect(receipt(user)).toBeSome(Cl.uint(entry.credit!));
        else expect(receipt(user)).toBeNone();
      }
      expect(n((read(adapter,'get-total-deposited') as any).value)).toBe([...positions.values()].reduce((sum,x)=>sum+x.amount,0n));
      expect(n(read('vault-v7','get-total-deposited'))).toBe([...positions.values()].reduce((sum,x)=>sum+x.amount,0n));
      accounting();
    }
    for(const count of executed) expect(count).toBeGreaterThan(0);
  });
});
