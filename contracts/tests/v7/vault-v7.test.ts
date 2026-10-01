import { beforeEach, describe, expect, it } from 'vitest';
import { Cl, type ClarityValue } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const owner = accounts.get('deployer')!;
const users = [accounts.get('wallet_1')!, accounts.get('wallet_2')!, accounts.get('wallet_3')!];
const sync = 'mock-sync-v7';
const async = 'mock-async-v7';
const vault = 'vault-v7';
const token = Cl.contractPrincipal(owner, 'mock-sbtc');
const cp = (name: string) => Cl.contractPrincipal(owner, name);
const addr = (name: string) => `${owner}.${name}`;
const call = (fn: string, args: ClarityValue[] = [], sender = owner) => simnet.callPublicFn(vault, fn, args, sender).result;
const read = (fn: string, args: ClarityValue[] = []) => simnet.callReadOnlyFn(vault, fn, args, owner).result;
const uint = (value: any): bigint => BigInt(value.value);
const roUint = (fn: string, args: ClarityValue[] = []) => uint(read(fn, args));
const bal = (who: string) => uint((simnet.callReadOnlyFn('mock-sbtc','get-balance',[Cl.principal(who)],owner).result as any).value);
const position = (who = users[0], adapter = sync) => read('get-position',[Cl.principal(who), cp(adapter)]);
const dep = (amount = 10000n, who = users[0], adapter = sync, min = 1n, maxFee = 500n) =>
  call(adapter === sync ? 'deposit' : 'deposit-async',[token,cp(adapter),Cl.uint(amount),Cl.uint(min),Cl.uint(maxFee)],who);
const exit = (who = users[0], adapter = sync, minimum = 0n) =>
  call(adapter === sync ? 'withdraw' : 'claim-withdraw',[token,cp(adapter),Cl.uint(minimum)],who);
function config(adapter = sync, bps = 10000n, lies = false, pause = false, stale = false, funded = false) {
  const args = [Cl.uint(bps),Cl.bool(lies),Cl.bool(pause),Cl.bool(stale)];
  if(adapter === async) args.push(Cl.bool(funded));
  expect(simnet.callPublicFn(adapter,'configure',args,owner).result).toBeOk(Cl.bool(true));
}
function bootstrap() {
  expect(call('set-sbtc-token',[token])).toBeOk(token);
  for(const name of [sync,async]) expect(call('schedule-adapter',[cp(name),Cl.bool(name === async),Cl.uint(50000000)])).toBeOk(Cl.uint(simnet.burnBlockHeight + 144));
  simnet.mineEmptyBurnBlocks(144);
  for(const name of [sync,async]) expect(call('apply-adapter',[cp(name)],users[2])).toBeOk(Cl.bool(true));
  expect(call('set-global-paused',[Cl.bool(false)])).toBeOk(Cl.bool(false));
  for(const who of [...users,addr(sync),addr(async)]) expect(simnet.callPublicFn('mock-sbtc','mint',[Cl.uint(100000000),Cl.principal(who)],owner).result).toBeOk(Cl.bool(true));
}
beforeEach(bootstrap);

describe('v7 access, admission and position isolation', () => {
  it('rejects unapproved adapters, unauthorized admin changes and repeated token initialization', () => {
    expect(call('set-global-paused',[Cl.bool(true)],users[0])).toBeErr(Cl.uint(100));
    expect(call('set-tvl-cap',[Cl.uint(1)],users[0])).toBeErr(Cl.uint(100));
    expect(call('schedule-adapter',[cp(sync),Cl.bool(false),Cl.uint(10000)],users[0])).toBeErr(Cl.uint(100));
    expect(call('set-sbtc-token',[token])).toBeErr(Cl.uint(116));
    call('revoke-adapter',[cp(sync)]);
    expect(dep()).toBeErr(Cl.uint(107));
  });
  it('rejects forwarding-contract owner phishing and user transaction hijacking', () => {
    expect(simnet.callPublicFn('forwarder-v7','phish-owner',[],owner).result).toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn('forwarder-v7','phish-deposit',[Cl.uint(10000)],users[0]).result).toBeErr(Cl.uint(124));
    expect(dep()).toBeOk(Cl.uint(10000));
    expect(simnet.callPublicFn('forwarder-v7','phish-withdraw',[],users[0]).result).toBeErr(Cl.uint(124));
    expect(roUint('get-total-deposited')).toBe(10000n);
  });
  it('allows one position per strategy and multiple independent strategies for one user', () => {
    expect(dep()).toBeOk(Cl.uint(10000));
    expect(dep(20000n,users[0],async)).toBeOk(Cl.uint(20000));
    expect(dep()).toBeErr(Cl.uint(109));
    expect(exit()).toBeOk(Cl.uint(10000));
    expect(position()).toBeNone();
    expect(roUint('get-adapter-deposited',[cp(async)])).toBe(20000n);
    expect(roUint('get-total-deposited')).toBe(20000n);
  });
  it('validates minimum deposits, fee consent and nonzero share slippage bounds', () => {
    expect(dep(999n)).toBeErr(Cl.uint(104));
    expect(dep(1000n,users[0],sync,1n,499n)).toBeErr(Cl.uint(106));
    expect(dep(1000n,users[0],sync,0n)).toBeErr(Cl.uint(123));
    expect(dep(1000n,users[0],sync,1001n)).toBeErr(Cl.uint(123));
    expect(bal(users[0])).toBe(100000000n);
    expect(dep(1000n)).toBeOk(Cl.uint(1000));
  });
  it('rejects uint128 maximum amounts with a typed cap error, rather than arithmetic abort', () => {
    expect(dep((1n << 128n)-1n)).toBeErr(Cl.uint(103));
    expect(dep()).toBeOk(Cl.uint(10000));
  });
  it('enforces global and adapter exposure independently', () => {
    call('schedule-adapter',[cp(sync),Cl.bool(false),Cl.uint(15000)]);
    simnet.mineEmptyBurnBlocks(144); call('apply-adapter',[cp(sync)]);
    expect(dep()).toBeOk(Cl.uint(10000));
    expect(dep(6000n,users[1])).toBeErr(Cl.uint(103));
    expect(dep(6000n,users[1],async)).toBeOk(Cl.uint(6000));
    expect(call('set-tvl-cap',[Cl.uint(15999)])).toBeErr(Cl.uint(103));
    call('set-tvl-cap',[Cl.uint(16000)]);
    expect(dep(1000n,users[2],async)).toBeErr(Cl.uint(103));
  });
  it('gates deposits on strategy pause and stale rate but permits exits', () => {
    dep(); config(sync,10000n,false,false,true);
    expect(dep(1000n,users[1])).toBeErr(Cl.uint(107));
    config(sync,10000n,false,true,true);
    expect(dep(1000n,users[1])).toBeErr(Cl.uint(101));
    call('set-global-paused',[Cl.bool(true)]); call('revoke-adapter',[cp(sync)]);
    expect(exit()).toBeOk(Cl.uint(10000));
  });
  it('rejects direct adapter use by unrelated callers', () => {
    expect(simnet.callPublicFn(sync,'deposit',[Cl.uint(1000),Cl.principal(users[0])],users[0]).result).toBeErr(Cl.uint(103));
    expect(simnet.callPublicFn(async,'request-withdraw',[Cl.uint(1000),Cl.principal(users[0])],users[0]).result).toBeErr(Cl.uint(103));
  });
});

describe('v7 governance timing', () => {
  it('requires Bitcoin burn blocks; rapid Stacks blocks do not accelerate onboarding', () => {
    call('revoke-adapter',[cp(sync)]);
    call('schedule-adapter',[cp(sync),Cl.bool(false),Cl.uint(50000000)]);
    simnet.mineEmptyStacksBlocks(500);
    expect(call('apply-adapter',[cp(sync)])).toBeErr(Cl.uint(110));
    simnet.mineEmptyBurnBlocks(143);
    expect(call('apply-adapter',[cp(sync)])).toBeErr(Cl.uint(110));
    simnet.mineEmptyBurnBlocks(1);
    expect(call('apply-adapter',[cp(sync)],users[1])).toBeOk(Cl.bool(true));
    expect(call('apply-adapter',[cp(sync)])).toBeErr(Cl.uint(111));
  });
  it('revocation cancels a pending enable operation', () => {
    call('schedule-adapter',[cp(sync),Cl.bool(false),Cl.uint(50000000)]);
    call('revoke-adapter',[cp(sync)]); simnet.mineEmptyBurnBlocks(144);
    expect(call('apply-adapter',[cp(sync)])).toBeErr(Cl.uint(111));
  });
  it('cannot change strategy kind or reduce its cap under existing exposure', () => {
    dep(); call('schedule-adapter',[cp(sync),Cl.bool(true),Cl.uint(50000000)]);
    simnet.mineEmptyBurnBlocks(144);
    expect(call('apply-adapter',[cp(sync)])).toBeErr(Cl.uint(119));
    call('schedule-adapter',[cp(sync),Cl.bool(false),Cl.uint(5000)]);
    simnet.mineEmptyBurnBlocks(144);
    expect(call('apply-adapter',[cp(sync)])).toBeErr(Cl.uint(103));
    expect(exit()).toBeOk(Cl.uint(10000));
    expect(call('apply-adapter',[cp(sync)])).toBeOk(Cl.bool(true));
  });
  it('supersedes stale fee proposals and charges entry-time fees to old positions', () => {
    dep(10000n); config(sync,12000n);
    call('schedule-fee-basis-points',[Cl.uint(800)]);
    call('schedule-fee-basis-points',[Cl.uint(1000)]);
    expect(call('apply-fee-basis-points')).toBeErr(Cl.uint(110));
    simnet.mineEmptyBurnBlocks(144);
    expect(call('apply-fee-basis-points',[],users[1])).toBeOk(Cl.uint(1000));
    expect(call('apply-fee-basis-points')).toBeErr(Cl.uint(111));
    expect(dep(10000n,users[1],sync,1n,500n)).toBeErr(Cl.uint(106));
    expect(dep(10000n,users[1],sync,1n,1000n)).toBeOk(Cl.uint(10000));
    expect(exit()).toBeOk(Cl.uint(11900));
    expect(exit(users[1])).toBeOk(Cl.uint(11800));
    expect(roUint('get-fee-balance')).toBe(300n);
    expect(call('schedule-fee-basis-points',[Cl.uint(1001)])).toBeErr(Cl.uint(106));
  });
  it('timelocks the fee recipient and collects only booked fees', () => {
    dep(); config(sync,11000n); exit();
    simnet.callPublicFn('mock-sbtc','mint',[Cl.uint(123),Cl.principal(addr(vault))],owner);
    call('schedule-fee-collector',[Cl.principal(users[2])]);
    expect(call('apply-fee-collector')).toBeErr(Cl.uint(110));
    simnet.mineEmptyBurnBlocks(144); call('apply-fee-collector');
    expect(call('collect-fee',[token],users[0])).toBeErr(Cl.uint(100));
    expect(call('collect-fee',[token])).toBeOk(Cl.uint(50));
    expect(bal(users[2])).toBe(100000050n);
    expect(bal(addr(vault))).toBe(123n);
    expect(call('collect-fee',[token])).toBeErr(Cl.uint(104));
  });
});

describe('v7 settlement correctness', () => {
  it('checks actual received funds; reported proceeds cannot steal existing donations or fees', () => {
    dep(); simnet.callPublicFn('mock-sbtc','mint',[Cl.uint(50000),Cl.principal(addr(vault))],owner);
    config(sync,10000n,true);
    expect(exit()).toBeErr(Cl.uint(122));
    expect(bal(addr(vault))).toBe(50000n);
    expect(roUint('get-total-deposited')).toBe(10000n);
    config(); expect(exit()).toBeOk(Cl.uint(10000));
    expect(bal(addr(vault))).toBe(50000n);
  });
  it('reverts losses below user minimum atomically and recovers the lock', () => {
    dep(); config(sync,9000n);
    expect(exit(users[0],sync,9001n)).toBeErr(Cl.uint(123));
    expect(roUint('get-total-deposited')).toBe(10000n);
    expect(bal(users[0])).toBe(99990000n);
    expect(exit(users[0],sync,9000n)).toBeOk(Cl.uint(9000));
    expect(roUint('get-fee-balance')).toBe(0n);
  });
  it('settles a fully lost position only with explicit zero minimum', () => {
    dep(); config(sync,0n);
    expect(exit(users[0],sync,1n)).toBeErr(Cl.uint(123));
    expect(exit()).toBeOk(Cl.uint(0));
    expect(position()).toBeNone(); expect(roUint('get-total-deposited')).toBe(0n);
    expect(dep()).toBeOk(Cl.uint(10000));
  });
  it('accounts profit and floor rounding in native integer satoshis', () => {
    dep(10001n); config(sync,13333n);
    const gross = 10001n * 13333n / 10000n;
    const fee = (gross - 10001n) * 500n / 10000n;
    expect(exit()).toBeOk(Cl.uint(gross-fee));
    expect(roUint('get-fee-balance')).toBe(fee);
    expect(bal(addr(vault))).toBe(fee);
  });
  it('does not let one wallet withdraw another wallet position', () => {
    dep(); expect(exit(users[1])).toBeErr(Cl.uint(105));
    expect(roUint('get-total-deposited')).toBe(10000n);
  });
});

describe('v7 asynchronous lifecycle', () => {
  it('requires request, funding, and a protected claim; cannot double claim', () => {
    dep(10000n,users[0],async);
    expect(exit(users[0],async)).toBeErr(Cl.uint(120));
    expect(call('request-withdraw',[cp(async)],users[0])).toBeOk(Cl.uint(1));
    expect(call('request-withdraw',[cp(async)],users[0])).toBeErr(Cl.uint(120));
    expect(exit(users[0],async)).toBeErr(Cl.uint(125));
    config(async,11000n,false,true,true,true); call('set-global-paused',[Cl.bool(true)]); call('revoke-adapter',[cp(async)]);
    expect(exit(users[0],async,10951n)).toBeErr(Cl.uint(123));
    expect(exit(users[0],async,10950n)).toBeOk(Cl.uint(10950));
    expect(exit(users[0],async)).toBeErr(Cl.uint(105));
    expect(roUint('get-fee-balance')).toBe(50n);
  });
  it('cancels unfunded redemptions and allows requesting a fresh claim', () => {
    dep(10000n,users[0],async); call('request-withdraw',[cp(async)],users[0]);
    expect(call('cancel-withdraw',[cp(async)],users[0])).toBeOk(Cl.bool(true));
    expect(call('cancel-withdraw',[cp(async)],users[0])).toBeErr(Cl.uint(120));
    expect(call('request-withdraw',[cp(async)],users[0])).toBeOk(Cl.uint(2));
    config(async,10000n,false,false,false,true);
    expect(call('cancel-withdraw',[cp(async)],users[0])).toBeErr(Cl.uint(126));
    expect(exit(users[0],async)).toBeOk(Cl.uint(10000));
  });
  it('isolates overlapping claims and rejects a dishonest async payout', () => {
    dep(10000n,users[0],async); dep(20000n,users[1],async);
    call('request-withdraw',[cp(async)],users[0]); call('request-withdraw',[cp(async)],users[1]);
    config(async,10000n,true,false,false,true);
    expect(exit(users[0],async)).toBeErr(Cl.uint(122));
    config(async,10000n,false,false,false,true);
    expect(exit(users[1],async)).toBeOk(Cl.uint(20000));
    expect(roUint('get-total-deposited')).toBe(10000n);
    expect(exit(users[0],async)).toBeOk(Cl.uint(10000));
  });
});

describe('v7 deterministic model-based sequence fuzzing', () => {
  for(const seed of [0x51a7,0xbee5,0xc0ffee,0xdeadbeef]) {
    it(`preserves solvency, position isolation and exact counters over 200 operations (seed ${seed})`, async () => {
      let rng = seed >>> 0;
      const random = (n: number) => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) % n; };
      const model = new Map<string,{amount:bigint,pending:boolean}>();
      let fees = 0n;
      for(let step=0; step<200; step++) {
        // Yield periodically so instrumented runs do not starve Vitest worker RPC.
        if(step % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        const user = users[random(users.length)]; const adapter = random(2) ? sync : async;
        const key = `${user}/${adapter}`; const state = model.get(key); const action = random(5);
        if(!state) {
          const amount = BigInt(1000 + random(100000));
          expect(dep(amount,user,adapter)).toBeOk(Cl.uint(amount)); model.set(key,{amount,pending:false});
        } else if(action === 0) {
          expect(dep(1000n,user,adapter)).toBeErr(Cl.uint(109));
        } else if(adapter === async && !state.pending) {
          const result = call('request-withdraw',[cp(async)],user);
          expect((result as any).type).toBe('ok'); state.pending = true;
        } else if(adapter === async && action === 1) {
          config(async);
          expect(call('cancel-withdraw',[cp(async)],user)).toBeOk(Cl.bool(true)); state.pending = false;
        } else {
          const bps = BigInt(random(15001)); // full loss through 50% gain
          config(adapter,bps,false,false,false,true);
          const gross = state.amount * bps / 10000n;
          const fee = gross > state.amount ? (gross-state.amount)*500n/10000n : 0n;
          const payout = gross-fee; const oldBalance = bal(user);
          if(action === 2) {
            expect(exit(user,adapter,payout+1n)).toBeErr(Cl.uint(123));
            expect(bal(user)).toBe(oldBalance);
          } else {
            expect(exit(user,adapter,payout)).toBeOk(Cl.uint(payout));
            expect(bal(user)).toBe(oldBalance+payout); fees += fee; model.delete(key);
          }
        }
        let total = 0n;
        for(const name of [sync,async]) {
          let exposure = 0n;
          for(const who of users) {
            const entry = model.get(`${who}/${name}`);
            if(entry) {
              exposure += entry.amount;
              const p = (position(who,name) as any).value.value;
              expect(uint(p['principal-amount'])).toBe(entry.amount);
              expect(uint(p.status)).toBe(entry.pending ? 1n : 0n);
              expect(uint(p['fee-bps'])).toBe(500n);
            } else expect(position(who,name)).toBeNone();
          }
          total += exposure; expect(roUint('get-adapter-deposited',[cp(name)])).toBe(exposure);
        }
        expect(roUint('get-total-deposited')).toBe(total);
        expect(roUint('get-fee-balance')).toBe(fees); expect(bal(addr(vault))).toBe(fees);
        const tokenSum = [...users,addr(sync),addr(async),addr(vault),owner].reduce((sum,who)=>sum+bal(who),0n);
        expect(tokenSum).toBe(500000000n);
      }
    });
  }
});
