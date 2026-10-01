import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, ClarityVersion, cvToString, Pc } from '@stacks/transactions';
import { CONTRACTS as C, decode } from '../src/index.mjs';

const root = new URL('../../../', import.meta.url);
const here = new URL('../', import.meta.url);
const holder = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const vault = holder + '.vault-v7';
const adapter = holder + '.zest-earn-adapter-v7';
const amount = 100000n;
const evidence = {
  schemaVersion: 1, network: 'mainnet-fork-only', mainnetWrites: false,
  initialHeight: 9101400, sdk: '@stacks/clarinet-sdk 3.24.1',
  funding: 'Existing canonical sBTC; a second wallet is funded by a local transfer from the existing holder. No mint, balance override, or upstream governance change.',
  startedAt: new Date().toISOString(), sources: [], steps: [], roundTrips: [],
};
const serial = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const simnet = await initSimnet(new URL('fork/Clarinet.toml', here).pathname, true);
const other = simnet.getAccounts().get('wallet_1');
assert.ok(other && other !== holder);
const ro = (c, f, args = []) => decode(simnet.callReadOnlyFn(c, f, args, holder).result);
const balance = who => ro(C.sbtc, 'get-balance', [Cl.principal(who)]);
const pc = (who, n) => Pc.principal(who).willSendEq(n).ft(C.sbtc, 'sbtc-token');
const sharesPc = (who, n) => Pc.principal(who).willSendEq(n).ft(C.zest, 'zft');
const position = who => ro(vault, 'get-position', [Cl.principal(who), Cl.principal(adapter)]);
const snapshot = () => ({
  holder: balance(holder), other: balance(other), vault: balance(vault), adapter: balance(adapter),
  total: ro(vault, 'get-total-deposited'), fees: ro(vault, 'get-fee-balance'),
  holderPosition: position(holder), otherPosition: position(other),
  holderShares: ro(adapter, 'get-shares', [Cl.principal(holder)]), otherShares: ro(adapter, 'get-shares', [Cl.principal(other)]),
});
function execute(c, f, args = [], sender = holder, pcs = []) {
  const r = simnet.callPublicFn(c, f, args, sender, { postConditionMode: 'deny', postConditions: pcs });
  assert.equal(r.result.type, 'ok', `${c}.${f}: ${cvToString(r.result)}`);
  evidence.steps.push({ contract: c, function: f, sender, result: cvToString(r.result), nativeDenyPostconditionsPassed: true,
    events: r.events.filter(e => !['print_event', 'contract_event'].includes(e.event)) });
  return decode(r.result);
}
try {
  for (const name of ['sip-010-trait', 'yield-source-v2', 'yield-source-async-v1', 'vault-v7', 'zest-earn-adapter-v7']) {
    const file = ['sip-010-trait', 'yield-source-v2', 'yield-source-async-v1'].includes(name)
      ? `contracts/contracts/traits/${name}.clar`
      : name === 'vault-v7' ? `contracts/contracts/${name}.clar` : `contracts/contracts/adapters/${name}.clar`;
    const source = await readFile(new URL(file, root), 'utf8');
    evidence.sources.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
    const r = simnet.deployContract(name, source, { clarityVersion: ClarityVersion.Clarity3 }, holder);
    assert.equal(cvToString(r.result), 'true', `${name}: ${cvToString(r.result)}`);
  }
  const initial = { holder: balance(holder), other: balance(other) };
  assert.ok(initial.holder > amount * 3n);
  evidence.initial = initial;
  execute(C.sbtc, 'transfer', [Cl.uint(amount), Cl.principal(holder), Cl.principal(other), Cl.none()], holder, [pc(holder, amount)]);
  execute(vault, 'set-sbtc-token', [Cl.principal(C.sbtc)]);
  execute(adapter, 'set-vault', [Cl.principal(vault)]);
  execute(vault, 'schedule-adapter', [Cl.principal(adapter), Cl.bool(false), Cl.uint(amount * 5n)]);
  simnet.mineEmptyBurnBlocks(144);
  execute(vault, 'apply-adapter', [Cl.principal(adapter)]);
  execute(vault, 'set-global-paused', [Cl.bool(false)]);
  execute(adapter, 'set-paused', [Cl.bool(false)]);
  execute(adapter, 'set-oracle-at', [Cl.uint(0), Cl.principal(holder)]);
  execute(adapter, 'set-oracle-at', [Cl.uint(1), Cl.principal(other)]);
  execute(adapter, 'set-apy', [Cl.uint(100)]);
  execute(adapter, 'set-apy', [Cl.uint(100)], other);

  for (const who of [holder, other]) {
    const preview = ro(adapter, 'preview-deposit', [Cl.uint(amount)]);
    const before = snapshot();
    const rejected = simnet.callPublicFn(vault, 'deposit', [Cl.principal(C.sbtc), Cl.principal(adapter), Cl.uint(amount), Cl.uint(preview + 1n), Cl.uint(500)], who);
    assert.equal(cvToString(rejected.result), '(err u123)');
    assert.deepEqual(snapshot(), before);
    evidence.steps.push({ label: 'minimum-shares-rejected', sender: who, result: cvToString(rejected.result), rollbackVerified: true });
    execute(vault, 'deposit', [Cl.principal(C.sbtc), Cl.principal(adapter), Cl.uint(amount), Cl.uint(preview), Cl.uint(500)], who,
      [pc(who, amount), pc(vault, 0n), pc(adapter, amount)]);
  }
  assert.equal(ro(vault, 'get-total-deposited'), amount * 2n);
  // These donations are unrelated to either user's redemption; neither can be swept.
  execute(C.sbtc, 'transfer', [Cl.uint(37), Cl.principal(holder), Cl.principal(adapter), Cl.none()], holder, [pc(holder, 37n)]);
  execute(C.sbtc, 'transfer', [Cl.uint(73), Cl.principal(holder), Cl.principal(vault), Cl.none()], holder, [pc(holder, 73n)]);
  evidence.donations = { adapter: 37n, vault: 73n };
  for (const who of [holder, other]) {
    if (who === other) {
      execute(adapter, 'set-paused', [Cl.bool(true)]);
      execute(vault, 'set-global-paused', [Cl.bool(true)]);
    }
    const shares = ro(adapter, 'get-shares', [Cl.principal(who)]);
    const gross = ro(adapter, 'preview-withdraw', [Cl.principal(who)]);
    const fee = gross > amount ? (gross - amount) * 500n / 10000n : 0n;
    const net = gross - fee;
    const before = snapshot();
    const tooHigh = simnet.callPublicFn(vault, 'withdraw', [Cl.principal(C.sbtc), Cl.principal(adapter), Cl.uint(net + 1n)], who);
    assert.equal(cvToString(tooHigh.result), '(err u123)');
    assert.deepEqual(snapshot(), before);
    evidence.steps.push({ label: 'minimum-payout-rejected', sender: who, result: cvToString(tooHigh.result), rollbackVerified: true });
    let rejected = false;
    try {
      simnet.callPublicFn(vault, 'withdraw', [Cl.principal(C.sbtc), Cl.principal(adapter), Cl.uint(net)], who,
        { postConditionMode: 'deny', postConditions: [pc(C.zest, gross), pc(vault, net)] });
    } catch (error) { rejected = /post.condition/i.test(String(error)); }
    assert.equal(rejected, true, 'Missing receipt-burn postcondition must reject');
    assert.deepEqual(snapshot(), before);
    evidence.steps.push({ label: 'missing-adapter-share-burn-condition-rejected', sender: who, rollbackVerified: true });
    const payout = execute(vault, 'withdraw', [Cl.principal(C.sbtc), Cl.principal(adapter), Cl.uint(net)], who,
      [sharesPc(adapter, shares), pc(C.zest, gross), pc(vault, net)]);
    assert.equal(payout, net);
    assert.equal(balance(who), before[who === holder ? 'holder' : 'other'] + net);
    assert.equal(balance(adapter), 37n);
    assert.equal(position(who), null);
    evidence.roundTrips.push({ owner: who, principal: amount, shares, gross, fee, net, exitedWhilePaused: who === other });
  }
  const final = snapshot();
  assert.equal(final.total, 0n);
  assert.equal(final.holderShares + final.otherShares, 0n);
  assert.equal(final.vault, 73n + final.fees);
  assert.equal(final.adapter, 37n);
  evidence.final = final;
  evidence.passed = true;
} catch (error) {
  evidence.passed = false; evidence.error = String(error); throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await writeFile(new URL('evidence/vault-mainnet-fork.json', here), serial(evidence));
  console.log(serial({ passed: evidence.passed, error: evidence.error, steps: evidence.steps.map(s => s.label ?? s.function), roundTrips: evidence.roundTrips, final: evidence.final }));
}
