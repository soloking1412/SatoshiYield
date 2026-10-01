import { expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
const owner = simnet.getAccounts().get('deployer')!;
it('deploys fail-closed with no configured asset or approved strategy', () => {
  expect(simnet.callReadOnlyFn('vault-v7','is-global-paused',[],owner).result).toBeBool(true);
  expect(simnet.callReadOnlyFn('vault-v7','get-sbtc-token',[],owner).result).toBeNone();
  expect(simnet.callReadOnlyFn('vault-v7','get-adapter-config',[Cl.contractPrincipal(owner,'mock-sync-v7')],owner).result).toBeNone();
  expect(simnet.callReadOnlyFn('vault-v7','get-total-deposited',[],owner).result).toBeUint(0);
});
it('computes exact bounded fees for uint128 boundary values without overflow', () => {
  const maximum = (1n << 128n)-1n;
  for(const profit of [0n,1n,9999n,10000n,maximum-1n,maximum]) {
    for(const rate of [0n,1n,500n,1000n]) {
      expect(simnet.callPrivateFn('vault-v7','fee',[Cl.uint(profit),Cl.uint(rate)],owner).result).toBeUint(profit * rate / 10000n);
    }
  }
});
