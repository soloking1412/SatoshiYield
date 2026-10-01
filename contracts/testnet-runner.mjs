#!/usr/bin/env node
// TESTNET ONLY. Mock-strategy evidence is not production protocol validation.
import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  getAddressFromPrivateKey, validateStacksAddress, makeContractDeploy, makeContractCall,
  broadcastTransaction, deserializeTransaction, ClarityVersion, ClarityType,
  PostConditionMode, contractPrincipalCV, standardPrincipalCV, uintCV, boolCV,
  Pc, cvToHex, hexToCV,
} from '@stacks/transactions';

const root = dirname(fileURLToPath(import.meta.url));
const repository = resolve(root, '..');
const base = 'https://api.testnet.hiro.so';
const TESTNET_CHAIN_ID = 0x80000000;
const credential = resolve(homedir(), '.local/share/satoshiyields/testnet-rebuild/wallet.json');
const privateDir = dirname(credential);
const reportPath = resolve(repository, 'docs/validation/testnet-v7.json');
const preflightPath = resolve(repository, 'docs/validation/testnet-preflight.json');
const lockPath = resolve(privateDir, 'runner.lock');
const mode = process.argv[2] ?? 'status';
const retryLabel = process.argv[3];
const modes = ['status', 'preflight', 'deploy', 'init', 'negative', 'activate', 'exercise', 'economics', 'retry'];
if (!modes.includes(mode)) throw new Error(`Use ${modes.join(', ')}`);
if (mode === 'retry' && !retryLabel) throw new Error('retry requires the exact existing transaction label');
const READ_ONLY = mode === 'status' || mode === 'preflight';
const AMOUNT = 100_000n;
const MINT_AMOUNT = 10_000_000n;
const ADAPTER_CAP = 50_000_000n;
const FEE = 1_000_000n; // Explicit maximum expenditure: one test STX per submitted transaction.
const adapters = ['mock-sync-v7', 'mock-async-v7'];
const contracts = [
  ['sip-010-trait', 'contracts/traits/sip-010-trait.clar'],
  ['yield-source-v2', 'contracts/traits/yield-source-v2.clar'],
  ['yield-source-async-v1', 'contracts/traits/yield-source-async-v1.clar'],
  ['vault-v7', 'contracts/vault-v7.clar'],
  ['mock-sbtc', 'contracts/token/mock-sbtc.clar'],
  ['mock-sync-v7', 'tests/v7/fixtures/mock-sync-v7.clar'],
  ['mock-async-v7', 'tests/v7/fixtures/mock-async-v7.clar'],
];
const publicJson = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const hash = source => createHash('sha256').update(source).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, publicJson(value));
  await rename(temporary, path);
}
async function acquireLock() {
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, mode, startedAt: new Date().toISOString() }));
    await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    try { process.kill(lock.pid, 0); } catch (e) {
      if (e.code !== 'ESRCH') throw e;
      await unlink(lockPath);
      return acquireLock();
    }
    throw new Error(`Another runner process (${lock.pid}) owns the verification lock`);
  }
}
async function mapLimited(items, action, limit = 4) {
  const results = new Array(items.length);
  const errors = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = await action(items[index], index); }
      catch (error) { errors.push(error); }
    }
  }));
  if (errors.length) throw errors[0];
  return results;
}
async function api(path, options) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(20_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
      continue;
    }
    if (!response.ok) {
      const error = new Error(`Testnet HTTP ${response.status} at ${path.split('?')[0]}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
}
function decode(cv) {
  switch (cv.type) {
    case ClarityType.UInt: return cv.value.toString();
    case ClarityType.BoolTrue: return true;
    case ClarityType.BoolFalse: return false;
    case ClarityType.PrincipalStandard:
    case ClarityType.PrincipalContract: return cv.value;
    case ClarityType.OptionalNone: return null;
    case ClarityType.OptionalSome:
    case ClarityType.ResponseOk: return decode(cv.value);
    case ClarityType.Tuple: return Object.fromEntries(Object.entries(cv.value).map(([k, v]) => [k, decode(v)]));
    case ClarityType.ResponseErr: throw new Error(`Contract read returned err ${JSON.stringify(decode(cv.value))}`);
    default: throw new Error(`Unsupported Clarity read type: ${cv.type}`);
  }
}
const expectOk = result => ({ status: 'success', result });
const expectError = code => ({ status: 'abort_by_response', result: `(err u${code})`, expectedFailure: true });

await acquireLock();
try {
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Read-only modes never load the private key.
  const wallet = READ_ONLY ? null : JSON.parse(await readFile(credential, 'utf8'));
  if (wallet) assert(wallet.network === 'testnet' && wallet.address === getAddressFromPrivateKey(wallet.privateKey, 'testnet'), 'Invalid testnet identity');
  const address = report?.address ?? wallet?.address;
  assert(address && /^(ST|SN)/.test(address) && validateStacksAddress(address), 'A valid testnet report/address is required');
  if (wallet) assert(address === wallet.address, 'Report belongs to another testnet signer');
  report ??= { network: 'testnet', address, description: 'Mock strategies only. No production protocol validation.', createdAt: new Date().toISOString(), transactions: [] };
  assert(report.network === 'testnet', 'Report is not testnet');
  report.schemaVersion = 2;
  report.evidence ??= {};
  const principal = name => contractPrincipalCV(address, name);
  const token = `${address}.mock-sbtc`;
  const tokenSpend = (who, amount) => Pc.principal(who).willSendEq(amount).ft(token, 'mock-sbtc');
  const noStx = () => Pc.principal(address).willSendEq(0n).ustx();
  const noTokenMovement = () => [noStx(), tokenSpend(address, 0n), ...['vault-v7', ...adapters].map(name => tokenSpend(`${address}.${name}`, 0n))];
  const depositPcs = () => [noStx(), tokenSpend(address, AMOUNT)];
  const exitPcs = name => [noStx(), tokenSpend(address, 0n), tokenSpend(`${address}.${name}`, AMOUNT), tokenSpend(`${address}.vault-v7`, AMOUNT)];
  let info;
  async function refreshNetwork() {
    const current = await api('/v2/info');
    assert(current.network_id === TESTNET_CHAIN_ID, 'Endpoint chain ID is not Stacks testnet');
    assert(Number.isSafeInteger(current.burn_block_height), 'Invalid burn block height');
    info = current;
    return current;
  }
  await refreshNetwork();
  async function save() {
    report.updatedAt = new Date().toISOString();
    report.burnBlockHeight = info.burn_block_height;
    const bootstrapLabels = [...contracts.map(([name]) => `deploy:${name}`), 'init:token', 'init:sync', 'init:async', 'init:mint'];
    const receiptPasses = label => {
      const tx = report.transactions.find(entry => entry.label === label);
      const expected = tx?.expected ?? expectOk();
      return tx?.canonical === true && !tx.lookupError
        && (expected.statuses ?? [expected.status]).includes(tx.status)
        && (expected.result === undefined ? tx.result?.startsWith('(ok ') : tx.result === expected.result);
    };
    const phase = (evidence, labels, incomplete) => evidence?.passed
      ? labels.length > 0 && labels.every(receiptPasses) ? 'passed' : 'receipt-reverification-required'
      : incomplete;
    const activation = phase(report.evidence.activation, ['activate:sync', 'activate:async', 'activate:unpause'], 'waiting-for-governance-and-confirmation');
    const lifecycle = phase(report.evidence.exercise, report.transactions.filter(tx => tx.label.startsWith('exercise:')).map(tx => tx.label), activation === 'passed' ? 'not-complete' : 'waiting-for-activation');
    report.progress = {
      bootstrap: bootstrapLabels.every(receiptPasses) ? 'passed' : 'waiting-for-canonical-bootstrap',
      sourceAttestation: report.evidence.preflight?.result ?? 'not-checked',
      negativeChecks: phase(report.evidence.negative, ['negative:premature-apply', 'negative:unapproved-deposit-no-transfer'], 'not-complete'),
      activation,
      lifecycle,
      economics: phase(report.evidence.economics, report.transactions.filter(tx => tx.label.startsWith('economics:')).map(tx => tx.label), report.evidence.economics?.status ?? (lifecycle === 'passed' ? 'not-started' : 'waiting-for-lifecycle')),
      unresolvedReceiptCount: report.transactions.filter(tx => tx.lookupError || tx.canonical !== true).length,
    };
    await atomicJson(reportPath, report);
  }
  function previous(label) { return report.transactions.find(tx => tx.label === label); }
  assert(new Set(report.transactions.map(tx => tx.label)).size === report.transactions.length, 'Duplicate transaction labels in report');
  async function refreshTransactions() {
    try { await mapLimited(report.transactions, async tx => {
      try {
        const chain = await api(`/extended/v1/tx/${tx.txid}`);
        assert(chain.sender_address === address, `Unexpected sender for ${tx.label}`);
        assert(BigInt(chain.nonce) === BigInt(tx.nonce), `Nonce mismatch for ${tx.label}`);
        Object.assign(tx, { status: chain.tx_status, result: chain.tx_result?.repr, blockHeight: chain.block_height, canonical: chain.canonical === true, checkedAt: new Date().toISOString() });
        delete tx.lookupError;
      } catch (error) {
        // Never retain a stale canonical assertion after a failed verification read.
        tx.lookupError = error.message;
        tx.canonical = false;
        if (error.status !== 404) throw error;
      }
    }); } catch (error) { await save(); throw error; }
    await save();
  }
  await refreshTransactions();
  function verifyOutcome(entry, expectation = entry.expected ?? expectOk()) {
    assert(!entry.lookupError, `Transaction lookup is unresolved: ${entry.label}`);
    const acceptedStatuses = expectation.statuses ?? [expectation.status];
    assert(entry.canonical === true && acceptedStatuses.includes(entry.status), `Expected canonical ${acceptedStatuses.join(' or ')} for ${entry.label}; got ${entry.status}`);
    if (expectation.result !== undefined) assert(entry.result === expectation.result, `Unexpected result for ${entry.label}: ${entry.result}; wanted ${expectation.result}`);
    else assert(entry.result?.startsWith('(ok '), `Expected an ok result for ${entry.label}`);
  }
  function requireSuccess(label) {
    const tx = previous(label);
    assert(tx, `Missing transaction: ${label}`);
    verifyOutcome(tx, expectOk());
  }
  const terminal = entry => entry.canonical === true && ['success', 'abort_by_response', 'abort_by_post_condition'].includes(entry.status);
  async function read(name, fn, args = []) {
    const response = await api(`/v2/contracts/call-read/${address}/${name}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: address, arguments: args.map(cvToHex) }) });
    assert(response.okay === true && typeof response.result === 'string', `Cannot verify ${name}.${fn}`);
    return decode(hexToCV(response.result));
  }
  async function snapshot() {
    await refreshNetwork();
    const calls = [
      ['tokenBinding', 'vault-v7', 'get-sbtc-token'], ['paused', 'vault-v7', 'is-global-paused'],
      ['totalDeposited', 'vault-v7', 'get-total-deposited'], ['feeBalance', 'vault-v7', 'get-fee-balance'],
      ['feeBps', 'vault-v7', 'get-fee-basis-points'], ['owner', 'vault-v7', 'get-owner'],
      ['feeCollector', 'vault-v7', 'get-fee-collector'],
      ['delay', 'vault-v7', 'get-timelock-blocks'], ['pendingFee', 'vault-v7', 'get-pending-fee'],
      ['pendingCollector', 'vault-v7', 'get-pending-collector'], ['supply', 'mock-sbtc', 'get-total-supply'],
      ['userBalance', 'mock-sbtc', 'get-balance', [standardPrincipalCV(address)]],
      ['vaultBalance', 'mock-sbtc', 'get-balance', [principal('vault-v7')]],
    ];
    for (const name of adapters) {
      calls.push(
        [`${name}:config`, 'vault-v7', 'get-adapter-config', [principal(name)]],
        [`${name}:proposal`, 'vault-v7', 'get-pending-adapter', [principal(name)]],
        [`${name}:exposure`, 'vault-v7', 'get-adapter-deposited', [principal(name)]],
        [`${name}:position`, 'vault-v7', 'get-position', [standardPrincipalCV(address), principal(name)]],
        [`${name}:total`, name, 'get-total-deposited'],
        [`${name}:shares`, name, 'get-shares', [standardPrincipalCV(address)]],
        [`${name}:preview`, name, 'preview-withdraw', [standardPrincipalCV(address)]],
        [`${name}:tokens`, 'mock-sbtc', 'get-balance', [principal(name)]],
      );
    }
    calls.push(['claimId', 'mock-async-v7', 'get-claim-id', [standardPrincipalCV(address)]]);
    const values = await mapLimited(calls, async ([key, name, fn, args]) => [key, await read(name, fn, args)]);
    return { checkedAt: new Date().toISOString(), burnBlockHeight: info.burn_block_height, stacksTip: info.stacks_tip, ...Object.fromEntries(values) };
  }
  async function verifySources() {
    const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
    const verified = await mapLimited(contracts, async ([name, path]) => {
      const local = await readFile(resolve(root, path), 'utf8');
      const deployed = await api(`/v2/contracts/source/${address}/${name}?proof=0`);
      assert(typeof deployed.source === 'string', `Missing deployed source: ${name}`);
      const worktreeSha256 = hash(local);
      const deployedSha256 = hash(deployed.source);
      const submittedSha256 = previous(`deploy:${name}`)?.sourceSha256;
      let committedSha256 = null;
      try { committedSha256 = hash(execFileSync('git', ['show', `HEAD:contracts/${path}`], { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] })); } catch { /* Uncommitted candidate: record missing attestation explicitly. */ }
      return { contract: `${address}.${name}`, path: `contracts/${path}`, deployedSha256, worktreeSha256, submittedSha256, committedSha256, matchesWorkingTree: worktreeSha256 === deployedSha256, matchesSubmittedSource: submittedSha256 === deployedSha256, matchesCommittedSource: committedSha256 === null ? null : committedSha256 === deployedSha256, publishHeight: deployed.publish_height };
    });
    return { repositoryHead, contracts: verified, workingTreeMatches: verified.every(c => c.matchesWorkingTree && c.matchesSubmittedSource), committedSourceVerification: verified.some(c => c.matchesCommittedSource === false) ? 'failed' : verified.some(c => c.matchesCommittedSource === null) ? 'incomplete-uncommitted-sources' : 'passed' };
  }
  function assertIdentity(state) {
    assert(state.owner === address && state.tokenBinding === token, 'Unexpected vault owner or token binding');
    assert(state.feeCollector === address, 'Unexpected fee collector');
    assert(state.delay === '144', 'Governance delay does not match the frozen deployment');
    assert(state.pendingFee === null && state.pendingCollector === null, 'Unexpected pending administration change');
    assert(state.feeBps === '500', 'Unexpected performance fee');
  }
  function assertEmpty(state, userBalance = MINT_AMOUNT.toString()) {
    assertIdentity(state);
    for (const field of ['totalDeposited', 'feeBalance', 'vaultBalance']) assert(state[field] === '0', `Expected zero ${field}`);
    assert(state.userBalance === userBalance, 'Mock principal was not fully restored');
    assert(state.supply === MINT_AMOUNT.toString(), 'Unexpected mock token supply');
    for (const name of adapters) {
      for (const field of ['exposure', 'total', 'shares', 'tokens']) assert(state[`${name}:${field}`] === '0', `Expected zero ${name}:${field}`);
      assert(state[`${name}:position`] === null, `Expected no position for ${name}`);
    }
    assert(state.claimId === null, 'Expected no pending mock claim');
  }
  function assertBaseline(state) {
    assertEmpty(state);
    assert(state.paused === true, 'Baseline must remain paused');
    for (const name of adapters) {
      assert(state[`${name}:config`] === null, `An adapter is already configured: ${name}`);
      const proposal = state[`${name}:proposal`];
      assert(proposal && proposal.cap === ADAPTER_CAP.toString() && proposal['is-async'] === name.includes('async'), `Unexpected proposal for ${name}`);
    }
  }
  function assertEnabled(state) {
    assertIdentity(state);
    for (const name of adapters) {
      const config = state[`${name}:config`];
      assert(config?.enabled === true && config.cap === ADAPTER_CAP.toString() && config['is-async'] === name.includes('async'), `Adapter not enabled as expected: ${name}`);
      assert(state[`${name}:proposal`] === null, `Adapter proposal not consumed: ${name}`);
    }
    assert(state.paused === false, 'Vault remains paused');
  }
  async function preflight() {
    const checks = [];
    const check = (name, action) => { try { action(); checks.push({ name, passed: true }); } catch (error) { checks.push({ name, passed: false, error: error.message }); } };
    for (const label of [...contracts.map(([name]) => `deploy:${name}`), 'init:token', 'init:sync', 'init:async', 'init:mint']) check(`canonical:${label}`, () => requireSuccess(label));
    const sources = await verifySources();
    check('deployed-source-matches-submission-and-working-tree', () => assert(sources.workingTreeMatches, 'Source hash mismatch'));
    check('committed-sources-do-not-conflict', () => assert(sources.committedSourceVerification !== 'failed', 'A committed source differs from its deployment'));
    const state = await snapshot();
    check('initial-paused-unapproved-empty-state', () => assertBaseline(state));
    const timelocks = adapters.map(name => {
      const at = state[`${name}:proposal`]?.at;
      return { adapter: `${address}.${name}`, earliestBurnBlock: at ?? null, currentBurnBlock: state.burnBlockHeight, remainingBurnBlocks: at === undefined ? null : Math.max(0, Number(BigInt(at) - BigInt(state.burnBlockHeight))), ready: at !== undefined && BigInt(at) <= BigInt(state.burnBlockHeight) };
    });
    const result = { schemaVersion: 1, network: 'testnet', chainId: TESTNET_CHAIN_ID, address, endpoint: base, checkedAt: new Date().toISOString(), scope: 'Mock fixture deployment only; no real protocol integration or yield validation.', result: checks.every(c => c.passed) ? sources.committedSourceVerification === 'passed' ? 'passed' : 'partial' : 'failed', checks, sources, state, timelocks, committedSourceNote: 'A deployed/submitted/working-tree match is not a git-commit attestation. Uncommitted files are reported as incomplete until committed.' };
    await atomicJson(preflightPath, result);
    report.evidence.preflight = { checkedAt: result.checkedAt, result: result.result, artifact: 'docs/validation/testnet-preflight.json', remainingBurnBlocks: timelocks.map(t => ({ adapter: t.adapter, remainingBurnBlocks: t.remainingBurnBlocks })) };
    await save();
    console.log(publicJson({ mode, result: result.result, checks, timelocks, committedSourceVerification: sources.committedSourceVerification }));
    assert(checks.every(c => c.passed), 'Preflight has failed checks; see public evidence');
  }
  async function nextNonce() {
    const account = await api(`/v2/accounts/${address}?proof=0`);
    assert(BigInt(account.balance) >= FEE * 2n, 'Need at least two test STX for the next bounded submission');
    let nonce = BigInt(account.nonce);
    for (const tx of report.transactions) {
      assert(terminal(tx), `Unresolved transaction blocks a new nonce: ${tx.label}. Inspect status; use retry only for an identical recorded transaction.`);
      const resolvedNegative = tx.label === 'negative:unapproved-deposit'
        && tx.status === 'abort_by_post_condition' && tx.result === '(err u107)'
        && tx.expectationFailure?.replacementLabel === 'negative:unapproved-deposit-no-transfer'
        && tx.stateVerifiedAt;
      if (!resolvedNegative) verifyOutcome(tx);
      if (BigInt(tx.nonce) >= nonce) nonce = BigInt(tx.nonce) + 1n;
    }
    return nonce;
  }
  async function send(label, make, extra = {}) {
    assert(wallet, 'Read-only mode cannot sign');
    assert(!previous(label), `Transaction already recorded: ${label}`);
    await refreshNetwork();
    const nonce = await nextNonce();
    const tx = await make({ senderKey: wallet.privateKey, network: 'testnet', nonce, fee: FEE, postConditionMode: PostConditionMode.Deny });
    assert(tx.chainId === TESTNET_CHAIN_ID && tx.transactionVersion === 0x80, 'Refusing to sign/broadcast a non-testnet transaction');
    assert(tx.postConditionMode === PostConditionMode.Deny, 'Testnet transactions must deny unlisted asset movements');
    const entry = { label, nonce: nonce.toString(), txid: `0x${tx.txid()}`, status: 'unknown', canonical: false, submittedAt: new Date().toISOString(), feeMicroStx: FEE.toString(), ...extra };
    await mkdir(resolve(privateDir, 'signed-transactions'), { recursive: true, mode: 0o700 });
    const signedPath = resolve(privateDir, 'signed-transactions', `${entry.txid}.hex`);
    try { await writeFile(signedPath, tx.serialize(), { mode: 0o600, flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      assert((await readFile(signedPath, 'utf8')).trim() === tx.serialize(), 'An interrupted pre-broadcast record has different signed bytes');
    }
    report.transactions.push(entry);
    await save(); // Persist the exact identity before network I/O; never create a replacement nonce automatically.
    try {
      const result = await broadcastTransaction({ transaction: tx, network: 'testnet' });
      if (result.error) { entry.status = 'broadcast-error'; entry.error = result.reason ?? result.error; await save(); throw new Error(`Broadcast rejected ${label}: ${entry.error}`); }
      const returnedId = result.txid?.replace(/^0x/, '');
      assert(returnedId === tx.txid(), `Broadcast txid mismatch for ${label}`);
      entry.status = 'pending';
      delete entry.error;
      await save();
      console.log(publicJson({ label, txid: entry.txid, status: 'pending', next: `Re-run ${mode} after canonical confirmation. No dependent transaction was sent.` }));
    } catch (error) {
      if (entry.status !== 'broadcast-error') { entry.status = 'unknown'; entry.error = 'Broadcast response uncertain; verify the recorded transaction identity before retrying.'; await save(); }
      throw error;
    }
    return entry;
  }
  async function call(label, name, fn, args, pcs = noTokenMovement(), expected = expectOk('(ok true)'), extra = {}) {
    return send(label, options => makeContractCall({ ...options, contractAddress: address, contractName: name, functionName: fn, functionArgs: args, postConditions: pcs }), { expected, contract: `${address}.${name}`, function: fn, ...extra });
  }
  async function stage(steps) {
    for (const step of steps) {
      const prior = previous(step.label);
      if (prior) {
        if (!terminal(prior)) { console.log(publicJson({ waitingFor: step.label, status: prior.status, txid: prior.txid, lookupError: prior.lookupError })); return false; }
        verifyOutcome(prior, step.expected ?? expectOk());
        if (!prior.stateVerifiedAt && step.after) {
          const state = await snapshot();
          await step.after(state, prior);
          prior.stateVerifiedAt = new Date().toISOString();
          prior.after = state;
          await save();
        }
        continue;
      }
      const before = await snapshot();
      const gate = step.gate ? await step.gate(before) : null;
      if (gate) {
        report.evidence[mode] = { status: 'waiting', passed: false, checkedAt: new Date().toISOString(), phase: step.label, ...gate };
        await save();
        console.log(publicJson(report.evidence[mode]));
        return false;
      }
      if (step.before) await step.before(before);
      if (mode === 'economics') report.evidence.economics = { status: 'waiting', passed: false, checkedAt: new Date().toISOString(), phase: step.label, waitingFor: 'canonical-confirmation' };
      await step.send(before);
      return false;
    }
    return true;
  }
  async function verifiedSourcesGate() {
    for (const [name] of contracts) requireSuccess(`deploy:${name}`);
    const sources = await verifySources();
    assert(sources.workingTreeMatches, 'Frozen deployment source differs from the current working tree/submission');
  }
  if (mode === 'status') {
    console.log(publicJson({ network: 'testnet', address, burnBlockHeight: info.burn_block_height, progress: report.progress, transactions: report.transactions.map(({ label, txid, status, result, canonical, expected, lookupError }) => ({ label, txid, status, result, canonical, expected, lookupError })) }));
  } else if (mode === 'preflight') {
    await preflight();
  } else if (mode === 'deploy') {
    for (const [name, path] of contracts) {
      const source = await readFile(resolve(root, path), 'utf8');
      const sourceSha256 = hash(source);
      const prior = previous(`deploy:${name}`);
      if (prior) {
        assert(prior.sourceSha256 === sourceSha256, `Source changed since broadcast: ${name}; publish a new deployment/version`);
        if (!terminal(prior)) { console.log(publicJson({ waitingFor: prior.label, txid: prior.txid, status: prior.status })); break; }
        verifyOutcome(prior, expectOk('(ok true)'));
        continue;
      }
      await send(`deploy:${name}`, options => makeContractDeploy({ ...options, contractName: name, codeBody: source, clarityVersion: ClarityVersion.Clarity3 }), { contract: `${address}.${name}`, sourceSha256, expected: expectOk('(ok true)') });
      break;
    }
  } else if (mode === 'init') {
    await verifiedSourcesGate();
    // Existing bootstrap transactions are adopted by exact canonical results. They are never repeated.
    const steps = [
      ['init:token', 'set-sbtc-token', [principal('mock-sbtc')], expectOk(`(ok '${token})`)],
      ['init:sync', 'schedule-adapter', [principal('mock-sync-v7'), boolCV(false), uintCV(ADAPTER_CAP)], expectOk()],
      ['init:async', 'schedule-adapter', [principal('mock-async-v7'), boolCV(true), uintCV(ADAPTER_CAP)], expectOk()],
      ['init:mint', 'mint', [uintCV(MINT_AMOUNT), standardPrincipalCV(address)], expectOk('(ok true)')],
    ];
    for (const [label, fn, args, expected] of steps) {
      const prior = previous(label);
      if (prior) { if (!terminal(prior)) { console.log(publicJson({ waitingFor: label, status: prior.status })); break; } verifyOutcome(prior, expected); continue; }
      await call(label, fn === 'mint' ? 'mock-sbtc' : 'vault-v7', fn, args, noTokenMovement(), expected);
      break;
    }
  } else if (mode === 'negative') {
    await verifiedSourcesGate();
    for (const label of ['init:token', 'init:sync', 'init:async', 'init:mint']) requireSuccess(label);
    const unchanged = (state, entry) => {
      assertBaseline(state);
      // STX network fees are intentionally excluded: failed transactions still pay them.
      const fields = ['userBalance', 'vaultBalance', 'totalDeposited', 'feeBalance', 'supply', 'mock-sync-v7:tokens', 'mock-async-v7:tokens', 'mock-sync-v7:proposal', 'mock-async-v7:proposal'];
      for (const field of fields) assert(publicJson(state[field]) === publicJson(entry.before[field]), `Expected failure changed ${field}`);
    };
    // The first campaign used an exact nonzero spend PC for an intentionally
    // rejected deposit. Hiro reports abort_by_post_condition as well as err u107.
    // Preserve that failed expectation; verify rollback and run a distinct test
    // with a zero-transfer guard so the receipt proves the contract rejection.
    const masked = previous('negative:unapproved-deposit');
    if (masked && !masked.expectationFailure) {
      assert(terminal(masked) && masked.canonical && masked.status === 'abort_by_post_condition' && masked.result === '(err u107)', 'Inspect the original rejected-deposit experiment before continuing');
      const state = await snapshot();
      unchanged(state, masked);
      masked.expectationFailure = {
        description: 'Exact nonzero-spend postcondition also failed on rollback, masking the receipt classification expected by the original runner.',
        originalExpectationPreserved: true,
        tokenRollbackVerified: true,
        replacementLabel: 'negative:unapproved-deposit-no-transfer',
      };
      masked.after = state;
      masked.stateVerifiedAt = new Date().toISOString();
      await save();
    }
    const completed = await stage([
      { label: 'negative:premature-apply', expected: expectError(110), before: state => { assertBaseline(state); assert(BigInt(state['mock-sync-v7:proposal'].at) - BigInt(state.burnBlockHeight) >= 6n, 'Too close to timelock maturity to safely test a premature apply'); }, send: before => call('negative:premature-apply', 'vault-v7', 'apply-adapter', [principal('mock-sync-v7')], noTokenMovement(), expectError(110), { before }), after: unchanged },
      { label: 'negative:unapproved-deposit-no-transfer', expected: expectError(107), before: assertBaseline, send: before => call('negative:unapproved-deposit-no-transfer', 'vault-v7', 'deposit', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(AMOUNT), uintCV(AMOUNT), uintCV(500)], noTokenMovement(), expectError(107), { before }), after: unchanged },
    ]);
    if (completed) { report.evidence.negative = { passed: true, checkedAt: new Date().toISOString(), tests: ['premature apply returns err u110', 'unapproved deposit returns err u107', 'mock token balances and vault accounting unchanged'], note: 'Canonical abort_by_response is the expected test result, not a successful deposit. Real test STX fees were paid. The earlier nonzero-spend-PC expectation mismatch remains recorded and is superseded by the no-transfer test.' }; await save(); console.log(publicJson(report.evidence.negative)); }
  } else if (mode === 'activate') {
    await verifiedSourcesGate();
    for (const label of ['init:token', 'init:sync', 'init:async', 'init:mint']) requireSuccess(label);
    const current = await snapshot();
    assertIdentity(current);
    // Check every not-yet-applied proposal before sending either activation.
    for (const name of adapters) {
      if (current[`${name}:config`]?.enabled === true && previous(name.includes('async') ? 'activate:async' : 'activate:sync')) continue;
      const proposal = current[`${name}:proposal`];
      assert(proposal && BigInt(proposal.at) <= BigInt(current.burnBlockHeight), `Timelock not matured for ${name}; earliest ${proposal?.at ?? 'unknown'}, current ${current.burnBlockHeight}. No activation broadcast.`);
    }
    const done = await stage([
      ...adapters.map(name => ({ label: name.includes('async') ? 'activate:async' : 'activate:sync', expected: expectOk('(ok true)'), before: state => { assertIdentity(state); assert(state.paused === true, 'Keep paused during adapter activation'); const p = state[`${name}:proposal`]; assert(p && BigInt(p.at) <= BigInt(state.burnBlockHeight), 'Timelock has not matured'); }, send: () => call(name.includes('async') ? 'activate:async' : 'activate:sync', 'vault-v7', 'apply-adapter', [principal(name)]), after: state => { const c = state[`${name}:config`]; assert(c?.enabled === true && c.cap === ADAPTER_CAP.toString() && c['is-async'] === name.includes('async'), 'Applied adapter config mismatch'); assert(state[`${name}:proposal`] === null && state.paused === true, 'Expected consumed proposal and still-paused vault'); } })),
      { label: 'activate:unpause', expected: expectOk('(ok false)'), before: state => { assertEmpty(state); assert(adapters.every(name => state[`${name}:config`]?.enabled), 'Both adapters must be enabled before unpausing'); }, send: () => call('activate:unpause', 'vault-v7', 'set-global-paused', [boolCV(false)], noTokenMovement(), expectOk('(ok false)')), after: assertEnabled },
    ]);
    if (done) { report.evidence.activation = { passed: true, checkedAt: new Date().toISOString(), burnBlockHeight: info.burn_block_height }; await save(); }
  } else if (mode === 'exercise') {
    await verifiedSourcesGate();
    for (const label of ['activate:sync', 'activate:async', 'activate:unpause']) requireSuccess(label);
    const baseline = report.evidence.exerciseBaseline;
    if (!baseline) { const state = await snapshot(); assertEmpty(state); assertEnabled(state); report.evidence.exerciseBaseline = state; await save(); }
    const initial = report.evidence.exerciseBaseline;
    const active = (name, state, status = '0') => {
      assertEnabled(state);
      assert(state.totalDeposited === AMOUNT.toString() && state.feeBalance === '0' && state.vaultBalance === '0', 'Unexpected vault exposure or fees');
      assert(state.userBalance === (BigInt(initial.userBalance) - AMOUNT).toString(), 'Unexpected user mock token balance');
      assert(state.supply === initial.supply, 'Unexpected mint/burn during exercise');
      const other = adapters.find(adapter => adapter !== name);
      const p = state[`${name}:position`];
      assert(p && p['principal-amount'] === AMOUNT.toString() && p['credited-shares'] === AMOUNT.toString() && p.status === status && p['fee-bps'] === '500' && p['is-async'] === name.includes('async'), `Unexpected position state for ${name}`);
      for (const field of ['exposure', 'total', 'shares', 'tokens']) { assert(state[`${name}:${field}`] === AMOUNT.toString(), `Unexpected ${name}:${field}`); assert(state[`${other}:${field}`] === '0', `Unexpected cross-adapter ${field}`); }
      assert(state[`${other}:position`] === null, 'Unexpected other adapter position');
      if (status === '1') assert(p['claim-id'] !== '0' && p['claim-id'] === state.claimId, 'Claim ID does not match pending position');
      else assert(p['claim-id'] === '0' && state.claimId === null, 'Unexpected outstanding claim');
    };
    const empty = state => { assertEnabled(state); assertEmpty(state, initial.userBalance); };
    const deposit = name => [principal('mock-sbtc'), principal(name), uintCV(AMOUNT), uintCV(AMOUNT), uintCV(500)];
    const done = await stage([
      { label: 'exercise:deposit-sync', expected: expectOk('(ok u100000)'), before: empty, send: () => call('exercise:deposit-sync', 'vault-v7', 'deposit', deposit('mock-sync-v7'), depositPcs(), expectOk('(ok u100000)')), after: state => active('mock-sync-v7', state) },
      { label: 'exercise:withdraw-sync', expected: expectOk('(ok u100000)'), before: state => active('mock-sync-v7', state), send: () => call('exercise:withdraw-sync', 'vault-v7', 'withdraw', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(AMOUNT)], exitPcs('mock-sync-v7'), expectOk('(ok u100000)')), after: empty },
      { label: 'exercise:deposit-async', expected: expectOk('(ok u100000)'), before: empty, send: () => call('exercise:deposit-async', 'vault-v7', 'deposit-async', deposit('mock-async-v7'), depositPcs(), expectOk('(ok u100000)')), after: state => active('mock-async-v7', state) },
      { label: 'exercise:request-async', expected: expectOk('(ok u1)'), before: state => active('mock-async-v7', state), send: () => call('exercise:request-async', 'vault-v7', 'request-withdraw', [principal('mock-async-v7')], noTokenMovement(), expectOk('(ok u1)')), after: state => active('mock-async-v7', state, '1') },
      { label: 'exercise:cancel-async', expected: expectOk('(ok true)'), before: state => active('mock-async-v7', state, '1'), send: () => call('exercise:cancel-async', 'vault-v7', 'cancel-withdraw', [principal('mock-async-v7')]), after: state => active('mock-async-v7', state) },
      { label: 'exercise:request-async-again', expected: expectOk('(ok u2)'), before: state => active('mock-async-v7', state), send: () => call('exercise:request-async-again', 'vault-v7', 'request-withdraw', [principal('mock-async-v7')], noTokenMovement(), expectOk('(ok u2)')), after: state => { active('mock-async-v7', state, '1'); assert(state.claimId === '2', 'Expected new claim ID after cancel/re-request'); } },
      { label: 'exercise:claim-unfunded', expected: expectError(125), before: state => active('mock-async-v7', state, '1'), send: () => call('exercise:claim-unfunded', 'vault-v7', 'claim-withdraw', [principal('mock-sbtc'), principal('mock-async-v7'), uintCV(AMOUNT)], noTokenMovement(), expectError(125)), after: state => active('mock-async-v7', state, '1') },
      { label: 'exercise:fund-async', expected: expectOk('(ok true)'), before: state => active('mock-async-v7', state, '1'), send: () => call('exercise:fund-async', 'mock-async-v7', 'configure', [uintCV(10000), boolCV(false), boolCV(false), boolCV(false), boolCV(true)]), after: state => active('mock-async-v7', state, '1') },
      { label: 'exercise:claim-async', expected: expectOk('(ok u100000)'), before: state => active('mock-async-v7', state, '1'), send: () => call('exercise:claim-async', 'vault-v7', 'claim-withdraw', [principal('mock-sbtc'), principal('mock-async-v7'), uintCV(AMOUNT)], exitPcs('mock-async-v7'), expectOk('(ok u100000)')), after: empty },
    ]);
    if (done) { const final = await snapshot(); empty(final); report.evidence.exercise = { passed: true, checkedAt: new Date().toISOString(), scope: 'Mock-only sync and async lifecycle; no real protocol yield was tested.', principalRestored: true, final }; await save(); console.log(publicJson(report.evidence.exercise)); }
  } else if (mode === 'economics') {
    await verifiedSourcesGate();
    if (!report.evidence.exercise?.passed) {
      report.evidence.economics = { status: 'waiting', passed: false, checkedAt: new Date().toISOString(), waitingFor: 'activation-and-complete-mock-lifecycle', note: 'No economics transaction was submitted. The original adapter timelock and lifecycle remain prerequisites.' };
      await save();
      console.log(publicJson(report.evidence.economics));
    } else {
      for (const tx of report.transactions.filter(entry => entry.label.startsWith('exercise:'))) verifyOutcome(tx);
      const SURPLUS = 10_000n;
      const GROSS_PROFIT = 110_000n;
      const SNAPSHOT_FEE = 500n;
      const NET_PROFIT_PAYOUT = GROSS_PROFIT - SNAPSHOT_FEE;
      const LOSS_PAYOUT = 90_000n;
      const CURRENT_FEE = '300';
      if (!report.evidence.economicsBaseline) {
        const baseline = await snapshot();
        assertEmpty(baseline);
        assertEnabled(baseline);
        report.evidence.economicsBaseline = baseline;
        report.evidence.economics = { status: 'waiting', passed: false, checkedAt: new Date().toISOString(), waitingFor: 'first-economics-transaction' };
        await save();
      }
      const baseline = report.evidence.economicsBaseline;
      const initialUser = BigInt(baseline.userBalance);
      const initialSupply = BigInt(baseline.supply);
      const profit = { user: initialUser, supply: initialSupply, tokens: 0n, principal: 0n, fees: 0n, currentFee: '500', entryFee: null, quote: 0n, pending: false };
      const funded = { ...profit, supply: initialSupply + SURPLUS, tokens: SURPLUS };
      const entered = { ...funded, user: initialUser - AMOUNT, tokens: GROSS_PROFIT, principal: AMOUNT, entryFee: '500', quote: GROSS_PROFIT };
      const scheduled = { ...entered, pending: true };
      const feeApplied = { ...entered, currentFee: CURRENT_FEE };
      const settled = { ...funded, user: initialUser + SURPLUS - SNAPSHOT_FEE, tokens: 0n, fees: SNAPSHOT_FEE, currentFee: CURRENT_FEE };
      const collected = { ...settled, user: initialUser + SURPLUS, fees: 0n };
      const lossEntered = { ...collected, user: initialUser + SURPLUS - AMOUNT, tokens: AMOUNT, principal: AMOUNT, entryFee: CURRENT_FEE, quote: LOSS_PAYOUT };
      const lossSettled = { ...collected, user: initialUser, tokens: AMOUNT - LOSS_PAYOUT };
      function economicsState(state, expected) {
        assert(state.owner === address && state.tokenBinding === token && state.delay === '144', 'Economics identity or governance delay mismatch');
        assert(state.feeCollector === address, 'Economics fee collector is not the campaign account');
        assert(state.paused === false && state.pendingCollector === null, 'Unexpected pause or collector proposal during economics tests');
        assert(state.feeBps === expected.currentFee, 'Current fee differs from the economics stage');
        for (const name of adapters) {
          const config = state[`${name}:config`];
          assert(config?.enabled === true && config.cap === ADAPTER_CAP.toString() && config['is-async'] === name.includes('async'), 'Economics adapter configuration mismatch');
          assert(state[`${name}:proposal`] === null, 'Unexpected adapter proposal during economics tests');
        }
        if (expected.pending) assert(state.pendingFee?.bps === CURRENT_FEE && /^\d+$/.test(state.pendingFee.at), 'Expected lower fee proposal');
        else assert(state.pendingFee === null, 'Unexpected pending fee proposal');
        assert(state.userBalance === expected.user.toString(), 'Unexpected user token balance in economics stage');
        assert(state.supply === expected.supply.toString(), 'Unexpected token supply in economics stage');
        assert(state['mock-sync-v7:tokens'] === expected.tokens.toString(), 'Unexpected strategy token balance in economics stage');
        assert(state.totalDeposited === expected.principal.toString() && state['mock-sync-v7:exposure'] === expected.principal.toString(), 'Unexpected economic exposure');
        assert(state['mock-sync-v7:shares'] === expected.principal.toString() && state['mock-sync-v7:total'] === expected.principal.toString(), 'Unexpected economic adapter counters');
        assert(state.feeBalance === expected.fees.toString() && state.vaultBalance === expected.fees.toString(), 'Accrued fee must match actual vault tokens');
        assert(state['mock-sync-v7:preview'] === expected.quote.toString(), 'Unexpected strategy quote');
        const position = state['mock-sync-v7:position'];
        if (expected.entryFee === null) assert(position === null, 'Expected settled economic position');
        else assert(position && position['fee-bps'] === expected.entryFee && position['principal-amount'] === AMOUNT.toString() && position['credited-shares'] === AMOUNT.toString() && position.status === '0' && position['claim-id'] === '0' && position['is-async'] === false, 'Entry-time fee snapshot or position mismatch');
        for (const field of ['exposure', 'total', 'shares', 'tokens', 'preview']) assert(state[`mock-async-v7:${field}`] === '0', 'Economics test changed the isolated async adapter');
        assert(state['mock-async-v7:position'] === null && state.claimId === null, 'Unexpected async position or claim during economics tests');
        // The mock token has only the holder and these contracts in this campaign.
        const accounted = BigInt(state.userBalance) + BigInt(state.vaultBalance) + BigInt(state['mock-sync-v7:tokens']) + BigInt(state['mock-async-v7:tokens']);
        assert(accounted === BigInt(state.supply), 'Tracked token balances do not reconcile with mock supply');
      }
      const expectState = expected => state => economicsState(state, expected);
      const minRejection = { statuses: ['abort_by_response', 'abort_by_post_condition'], result: '(err u123)', expectedFailure: true, note: 'Require the exact contract slippage error and unchanged state. A rolled-back transfer may also affect postcondition receipt classification.' };
      const done = await stage([
        { label: 'economics:configure-profit', expected: expectOk('(ok true)'), before: expectState(profit), send: () => call('economics:configure-profit', 'mock-sync-v7', 'configure', [uintCV(11000), boolCV(false), boolCV(false), boolCV(false)]), after: expectState(profit) },
        { label: 'economics:mint-profit-reserve', expected: expectOk('(ok true)'), before: expectState(profit), send: () => call('economics:mint-profit-reserve', 'mock-sbtc', 'mint', [uintCV(SURPLUS), principal('mock-sync-v7')]), after: expectState(funded) },
        { label: 'economics:deposit-profit', expected: expectOk('(ok u100000)'), before: expectState(funded), send: () => call('economics:deposit-profit', 'vault-v7', 'deposit', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(AMOUNT), uintCV(AMOUNT), uintCV(500)], depositPcs(), expectOk('(ok u100000)')), after: expectState(entered) },
        { label: 'economics:schedule-lower-fee', expected: expectOk(), before: expectState(entered), send: () => call('economics:schedule-lower-fee', 'vault-v7', 'schedule-fee-basis-points', [uintCV(300)], noTokenMovement(), expectOk()), after: (state, entry) => { economicsState(state, scheduled); assert(entry.result === `(ok u${state.pendingFee.at})`, 'Scheduled fee receipt and pending activation block differ'); report.evidence.economicsFeeGate = { scheduledBy: entry.txid, earliestBurnBlock: state.pendingFee.at, entryFeeBps: '500', proposedFeeBps: CURRENT_FEE }; } },
        { label: 'economics:apply-lower-fee', expected: expectOk('(ok u300)'), gate: state => { economicsState(state, scheduled); const at = BigInt(state.pendingFee.at); const remaining = at - BigInt(state.burnBlockHeight); return remaining > 0n ? { waitingFor: 'fee-timelock', earliestBurnBlock: at.toString(), currentBurnBlock: state.burnBlockHeight, remainingBurnBlocks: remaining.toString(), entryFeeBps: '500', proposedFeeBps: CURRENT_FEE } : null; }, before: expectState(scheduled), send: () => call('economics:apply-lower-fee', 'vault-v7', 'apply-fee-basis-points', [], noTokenMovement(), expectOk('(ok u300)')), after: expectState(feeApplied) },
        { label: 'economics:withdraw-profit', expected: expectOk('(ok u109500)'), before: expectState(feeApplied), send: () => call('economics:withdraw-profit', 'vault-v7', 'withdraw', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(NET_PROFIT_PAYOUT)], [noStx(), tokenSpend(address, 0n), tokenSpend(`${address}.mock-sync-v7`, GROSS_PROFIT), tokenSpend(`${address}.vault-v7`, NET_PROFIT_PAYOUT)], expectOk('(ok u109500)')), after: state => { economicsState(state, settled); report.evidence.economicsProfit = { passed: true, checkedAt: new Date().toISOString(), principal: AMOUNT.toString(), grossPayout: GROSS_PROFIT.toString(), profit: SURPLUS.toString(), entryFeeBps: '500', currentFeeBps: CURRENT_FEE, chargedFee: SNAPSHOT_FEE.toString(), netPayout: NET_PROFIT_PAYOUT.toString(), snapshotAcrossFeeChangeVerified: true }; } },
        { label: 'economics:collect-profit-fee', expected: expectOk('(ok u500)'), before: expectState(settled), send: () => call('economics:collect-profit-fee', 'vault-v7', 'collect-fee', [principal('mock-sbtc')], [noStx(), tokenSpend(address, 0n), tokenSpend(`${address}.vault-v7`, SNAPSHOT_FEE), ...adapters.map(name => tokenSpend(`${address}.${name}`, 0n))], expectOk('(ok u500)')), after: expectState(collected) },
        { label: 'economics:configure-loss', expected: expectOk('(ok true)'), before: expectState(collected), send: () => call('economics:configure-loss', 'mock-sync-v7', 'configure', [uintCV(9000), boolCV(false), boolCV(false), boolCV(false)]), after: expectState(collected) },
        { label: 'economics:deposit-loss', expected: expectOk('(ok u100000)'), before: expectState(collected), send: () => call('economics:deposit-loss', 'vault-v7', 'deposit', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(AMOUNT), uintCV(AMOUNT), uintCV(300)], depositPcs(), expectOk('(ok u100000)')), after: expectState(lossEntered) },
        { label: 'economics:reject-loss-minimum', expected: minRejection, before: expectState(lossEntered), send: () => call('economics:reject-loss-minimum', 'vault-v7', 'withdraw', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(AMOUNT)], noTokenMovement(), minRejection), after: expectState(lossEntered) },
        { label: 'economics:accept-loss', expected: expectOk('(ok u90000)'), before: expectState(lossEntered), send: () => call('economics:accept-loss', 'vault-v7', 'withdraw', [principal('mock-sbtc'), principal('mock-sync-v7'), uintCV(LOSS_PAYOUT)], [noStx(), tokenSpend(address, 0n), tokenSpend(`${address}.mock-sync-v7`, LOSS_PAYOUT), tokenSpend(`${address}.vault-v7`, LOSS_PAYOUT)], expectOk('(ok u90000)')), after: state => { economicsState(state, lossSettled); report.evidence.economicsLoss = { passed: true, checkedAt: new Date().toISOString(), principal: AMOUNT.toString(), tooHighMinimum: AMOUNT.toString(), rejectedWith: '(err u123)', acceptedMinimum: LOSS_PAYOUT.toString(), payout: LOSS_PAYOUT.toString(), principalShortfall: (AMOUNT - LOSS_PAYOUT).toString(), chargedFee: '0', retainedMockAdapterTokens: (AMOUNT - LOSS_PAYOUT).toString(), limitation: 'The frozen mock retains the unpaid tokens. This models a lower redemption payout; it does not destroy or externally invest the residual.' }; } },
      ]);
      if (done) {
        const final = await snapshot();
        economicsState(final, lossSettled);
        report.evidence.economics = { status: 'passed', passed: true, checkedAt: new Date().toISOString(), scope: 'Mock profit, fee snapshot across a real governance delay, fee collection, minimum-payout rejection and explicit partial-loss settlement.', mintedReserve: SURPLUS.toString(), currentFeeBps: CURRENT_FEE, userNetTokenChange: (BigInt(final.userBalance) - initialUser).toString(), residualAdapterTokens: (AMOUNT - LOSS_PAYOUT).toString(), notes: ['The earlier lifecycle evidence is retained as a historical snapshot.', 'The frozen mock retains 10000 tokens after its loss payout; no artificial cleanup was performed.', 'Profit was seeded by a bounded mock mint, not generated by a real protocol.'], final };
        await save();
        console.log(publicJson(report.evidence.economics));
      }
    }
  } else if (mode === 'retry') {
    const prior = previous(retryLabel);
    assert(prior, 'Unknown retry label');
    if (terminal(prior)) { verifyOutcome(prior); console.log(publicJson({ label: retryLabel, action: 'Already terminal; no rebroadcast', status: prior.status, result: prior.result })); }
    else if (prior.status === 'pending' && !prior.lookupError) { console.log(publicJson({ label: retryLabel, action: 'Still in mempool; no rebroadcast', txid: prior.txid })); }
    else {
      const account = await api(`/v2/accounts/${address}?proof=0`);
      assert(BigInt(account.nonce) <= BigInt(prior.nonce), 'Recorded nonce already consumed. Do not generate a replacement; investigate chain history.');
      const serialized = await readFile(resolve(privateDir, 'signed-transactions', `${prior.txid}.hex`), 'utf8');
      const tx = deserializeTransaction(serialized.trim());
      assert(`0x${tx.txid()}` === prior.txid && tx.chainId === TESTNET_CHAIN_ID && tx.transactionVersion === 0x80, 'Retry identity or network mismatch');
      assert(tx.postConditionMode === PostConditionMode.Deny, 'Retry postcondition mode mismatch');
      await refreshNetwork();
      const result = await broadcastTransaction({ transaction: tx, network: 'testnet' });
      assert(!result.error, `Identical retry rejected: ${result.reason ?? result.error}`);
      assert(result.txid?.replace(/^0x/, '') === tx.txid(), 'Retry returned an unexpected transaction ID');
      prior.status = 'pending'; prior.canonical = false; prior.rebroadcastAt = new Date().toISOString(); delete prior.lookupError; delete prior.error;
      await save();
      console.log(publicJson({ label: retryLabel, txid: prior.txid, action: 'Identical signed transaction rebroadcast; no replacement nonce' }));
    }
  }
} finally {
  await unlink(lockPath).catch(() => {});
}
