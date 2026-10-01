#!/usr/bin/env node
/**
 * Read-only release-source attestation. Run after committing the deployed sources:
 *   node scripts/attest-testnet-sources.mjs
 * Requires Node 24, Git, and the locked contracts dependencies (for principal validation).
 * Never imports the deployment runner, reads credentials, or submits a transaction.
 * Only the separate attestation JSON below is written; historical reports are read-only.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rename, realpath, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = 'contracts/testnet-runner.mjs';
const ledgerPath = 'docs/validation/testnet-v7.json';
const outputPath = 'docs/validation/testnet-release-source-attestation.json';
const api = 'https://api.testnet.hiro.so';
const CHAIN_ID = 0x80000000;
const EXPECTED_NAMES = [
  'sip-010-trait', 'yield-source-v2', 'yield-source-async-v1', 'vault-v7',
  'mock-sbtc', 'mock-sync-v7', 'mock-async-v7',
];
const HASH = /^[0-9a-f]{64}$/;
const TXID = /^0x[0-9a-f]{64}$/;
const NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const failMessage = error => error instanceof Error ? error.message : String(error);
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  network: 'testnet',
  chainId: CHAIN_ID,
  api,
  result: 'failed',
  scope: 'Exact deployed mock-testnet source bytes, submitted hashes, working tree and one Git commit. Not a production-protocol attestation or a consensus proof.',
  ledgerPath,
  runnerPath,
  contracts: [],
  errors: [],
};

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repository, encoding, maxBuffer: MAX_RESPONSE_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function hash32(value, label) {
  assert(typeof value === 'string' && /^(?:0x)?[0-9a-fA-F]{64}$/.test(value), `Invalid ${label}`);
  return `0x${value.replace(/^0x/, '').toLowerCase()}`;
}
function exactNonce(value) {
  if (typeof value === 'number') {
    assert(Number.isSafeInteger(value) && value >= 0, 'Invalid transaction nonce');
    return BigInt(value).toString();
  }
  assert(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'Invalid transaction nonce');
  return BigInt(value).toString();
}
async function publicFile(path) {
  assert(typeof path === 'string' && /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').some(p => p === '..' || p === '.' || !p), `Invalid repository path: ${path}`);
  const absolute = resolve(repository, path);
  assert(relative(repository, absolute) === path.split('/').join(sep), `Path escapes repository: ${path}`);
  assert((await lstat(absolute)).isFile(), `Not a regular file: ${path}`);
  assert(await realpath(absolute) === absolute, `Symlinked path is not allowed: ${path}`);
  const bytes = await readFile(absolute);
  assert(bytes.length > 0 && bytes.length <= MAX_RESPONSE_BYTES, `Invalid file size: ${path}`);
  return bytes;
}
function utf8(bytes, label) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(`Invalid UTF-8: ${label}`); }
}
function sourceBytes(source, label) {
  assert(typeof source === 'string' && source.length > 0, `Missing source text: ${label}`);
  const bytes = Buffer.from(source, 'utf8');
  assert(bytes.length <= MAX_RESPONSE_BYTES && bytes.toString('utf8') === source, `Invalid source encoding/size: ${label}`);
  return bytes;
}
function parseManifest(source) {
  // Parse only the literal array. Do not evaluate or import the credential-aware runner.
  const headers = [...source.matchAll(/^const contracts = \[\r?$/gm)];
  assert(headers.length === 1, 'Runner must contain exactly one static contracts list');
  const start = headers[0].index + headers[0][0].length;
  const tail = source.slice(start);
  const end = /^\];\r?$/m.exec(tail);
  assert(end, 'Unterminated runner contracts list');
  const lines = tail.slice(0, end.index).split(/\r?\n/).filter(line => line.trim());
  const entries = lines.map(line => {
    const match = /^\s*\['([a-zA-Z][a-zA-Z0-9_-]{0,39})', '([a-zA-Z0-9_/-]+\.clar)'\],\s*$/.exec(line);
    assert(match, 'Runner contracts list is no longer a supported static literal');
    const [, name, path] = match;
    assert(NAME.test(name) && !path.split('/').some(part => !part || part === '.' || part === '..'), 'Invalid contract name or source path');
    assert(path.startsWith('contracts/') || path.startsWith('tests/v7/fixtures/'), 'Unexpected source directory in runner');
    return { name, path: `contracts/${path}` };
  });
  assert(entries.length === 7 && entries.every((entry, i) => entry.name === EXPECTED_NAMES[i]), 'Runner deployment set/order must be the exact seven reviewed contracts');
  assert(new Set(entries.map(x => x.path)).size === 7, 'Duplicate deployed source path');
  return entries;
}
function deploymentRecords(ledger, entries, validateStacksAddress) {
  assert(object(ledger) && ledger.network === 'testnet', 'Public ledger must be testnet');
  assert(typeof ledger.address === 'string' && /^(ST|SN)[0-9A-HJKMNP-TV-Z]+$/.test(ledger.address) && validateStacksAddress(ledger.address), 'Invalid checksum/network for public testnet deployer');
  assert(Array.isArray(ledger.transactions), 'Missing transaction ledger');
  assert(ledger.transactions.every(object), 'Malformed transaction record');
  const deployed = ledger.transactions.filter(tx => typeof tx.label === 'string' && tx.label.startsWith('deploy:'));
  assert(deployed.length === 7, 'Expected exactly seven deployment records');
  assert(new Set(deployed.map(tx => tx.label)).size === 7 && new Set(deployed.map(tx => tx.txid)).size === 7, 'Duplicate deployment label or transaction ID');
  return entries.map(({ name, path }) => {
    const tx = deployed.find(item => item.label === `deploy:${name}`);
    assert(tx && tx.contract === `${ledger.address}.${name}`, `Deployment principal mismatch: ${name}`);
    assert(typeof tx.txid === 'string' && TXID.test(tx.txid), `Invalid submitted transaction ID: ${name}`);
    assert(typeof tx.sourceSha256 === 'string' && HASH.test(tx.sourceSha256), `Invalid submitted source hash: ${name}`);
    assert(tx.status === 'success' && tx.canonical === true && !tx.lookupError && positiveInteger(tx.blockHeight), `Deployment is not verified successful in the public ledger: ${name}`);
    return { name, path, contract: tx.contract, txid: tx.txid, nonce: exactNonce(tx.nonce), submittedSourceSha256: tx.sourceSha256, recordedPublishHeight: tx.blockHeight };
  });
}
async function jsonGet(path) {
  assert(path.startsWith('/') && !path.startsWith('//'), 'Invalid API path');
  // All requests are sequential GETs to the fixed public testnet API.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(api + path, {
      method: 'GET', redirect: 'error', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
      continue;
    }
    assert(response.status === 200, `Testnet HTTP ${response.status}: ${path.split('?')[0]}`);
    assert(/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''), `Non-JSON response: ${path.split('?')[0]}`);
    assert(response.body, 'Empty API response body');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('API JSON exceeds response limit'); }
      chunks.push(value);
    }
    let value;
    try { value = JSON.parse(utf8(Buffer.concat(chunks), path)); }
    catch { throw new Error(`Malformed JSON response: ${path.split('?')[0]}`); }
    assert(object(value) && !Object.hasOwn(value, 'error') && !Object.hasOwn(value, 'error_reason') && value.okay !== false, `Unsuccessful JSON response: ${path.split('?')[0]}`);
    return value;
  }
  throw new Error('API retry limit exhausted');
}
function validateInfo(info) {
  assert(info.network_id === CHAIN_ID, 'API network_id is not Stacks testnet');
  assert(positiveInteger(info.stacks_tip_height) && positiveInteger(info.burn_block_height), 'Invalid node block heights');
  return { stacksHeight: info.stacks_tip_height, stacksHash: hash32(info.stacks_tip, 'node tip hash'), burnHeight: info.burn_block_height };
}
function validateBlock(block, height, expectedHash) {
  assert(block.canonical === true && block.height === height, `Block ${height} is not canonical`);
  const hash = hash32(block.hash, 'block hash');
  if (expectedHash) assert(hash === expectedHash, `Canonical block ${height} differs from expected hash`);
  assert(positiveInteger(block.burn_block_height), 'Invalid block Bitcoin height');
  return { stacksHeight: height, stacksHash: hash, indexBlockHash: hash32(block.index_block_hash, 'index block hash'), burnHeight: block.burn_block_height };
}

try {
  assert(process.argv.length === 2, 'This attester takes no arguments or alternate endpoints');
  assert(Number(process.versions.node.split('.')[0]) === 24, 'Use Node 24 for the pinned rebuild toolchain');
  assert(await realpath(repository) === repository, 'Repository must not be reached through a symlink');
  assert(git(['rev-parse', '--show-toplevel']).trim() === repository, 'Run against the expected repository root');
  const commit = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  assert(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit), 'Invalid Git commit identity');
  report.git = { commit, committedAt: git(['show', '-s', '--format=%cI', commit]).trim(), initialHead: commit };
  const { validateStacksAddress } = createRequire(new URL('../contracts/package.json', import.meta.url))('@stacks/transactions');
  const runner = await publicFile(runnerPath);
  report.runnerSourceSha256 = sha256(runner);
  const entries = parseManifest(utf8(runner, runnerPath));
  const ledgerBytes = await publicFile(ledgerPath);
  report.ledgerSha256AtStart = sha256(ledgerBytes);
  const ledger = JSON.parse(utf8(ledgerBytes, ledgerPath));
  const deployments = deploymentRecords(ledger, entries, validateStacksAddress);
  report.deployer = ledger.address;
  report.git.sourceStatusAtStart = git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...entries.map(x => x.path)]).trim();
  if (report.git.sourceStatusAtStart) report.errors.push('One or more deployed source files have staged, unstaged or untracked changes');

  const info = validateInfo(await jsonGet('/v2/info'));
  const context = validateBlock(await jsonGet(`/extended/v2/blocks/${info.stacksHeight}`), info.stacksHeight, info.stacksHash);
  assert(context.burnHeight <= info.burnHeight, 'Canonical Stacks block is ahead of the node Bitcoin tip');
  report.context = { observedAt: new Date().toISOString(), ...context, nodeBurnHeight: info.burnHeight };
  const blocks = new Map([[context.stacksHeight, context]]);

  for (const deployment of deployments) {
    const record = { ...deployment, errors: [], matched: false };
    report.contracts.push(record);
    try {
      const working = await publicFile(deployment.path);
      record.workingTreeSha256 = sha256(working);
      utf8(working, deployment.path);
      const tree = git(['ls-tree', '-z', commit, '--', deployment.path]);
      const treeEntry = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([^\0]+)\0$/.exec(tree);
      assert(treeEntry && treeEntry[3] === deployment.path, `Source is absent or not a regular blob at commit ${commit}`);
      record.gitBlob = treeEntry[2];
      const committed = git(['show', `${commit}:${deployment.path}`], null);
      record.gitHeadSourceSha256 = sha256(committed);
      record.matchesWorkingTreeAndCommit = record.workingTreeSha256 === record.gitHeadSourceSha256;
      assert(record.matchesWorkingTreeAndCommit, 'Working source differs from recorded Git HEAD source');
      assert(record.workingTreeSha256 === deployment.submittedSourceSha256, 'Working/committed source differs from submitted deployment hash');

      const receipt = await jsonGet(`/extended/v1/tx/${deployment.txid}`);
      assert(receipt.tx_id === deployment.txid && receipt.tx_type === 'smart_contract' && receipt.tx_status === 'success' && receipt.canonical === true && receipt.microblock_canonical !== false && receipt.unanchored !== true, 'Deployment receipt is not a canonical successful contract deployment');
      assert(receipt.sender_address === ledger.address && exactNonce(receipt.nonce) === deployment.nonce, 'Deployment sender or nonce mismatch');
      assert(object(receipt.smart_contract) && receipt.smart_contract.contract_id === deployment.contract, 'Published deployment principal mismatch');
      assert(positiveInteger(receipt.block_height) && receipt.block_height <= context.stacksHeight && receipt.block_height === deployment.recordedPublishHeight, 'Deployment height differs from recorded/snapshot context');
      record.receiptSourceSha256 = sha256(sourceBytes(receipt.smart_contract.source_code, deployment.contract));
      record.receiptBlockHash = hash32(receipt.block_hash, 'deployment block hash');
      if (!blocks.has(receipt.block_height)) blocks.set(receipt.block_height, validateBlock(await jsonGet(`/extended/v2/blocks/${receipt.block_height}`), receipt.block_height));
      const deploymentBlock = blocks.get(receipt.block_height);
      assert(deploymentBlock.stacksHash === record.receiptBlockHash && deploymentBlock.burnHeight <= context.burnHeight, 'Deployment receipt block differs from canonical history');
      record.deploymentBlock = deploymentBlock;

      const sourcePath = `/v2/contracts/source/${ledger.address}/${deployment.name}?proof=0&tip=${context.indexBlockHash}`;
      const published = await jsonGet(sourcePath);
      assert(positiveInteger(published.publish_height) && published.publish_height === receipt.block_height, 'Published source height does not match deployment receipt');
      record.publishedSourceSha256 = sha256(sourceBytes(published.source, deployment.contract));
      record.publishHeight = published.publish_height;
      record.sourceUrl = api + sourcePath;
      record.matchesSubmitted = record.publishedSourceSha256 === deployment.submittedSourceSha256;
      record.matchesReceipt = record.publishedSourceSha256 === record.receiptSourceSha256;
      record.matchesWorkingTree = record.publishedSourceSha256 === record.workingTreeSha256;
      record.matchesGitHead = record.publishedSourceSha256 === record.gitHeadSourceSha256;
      assert(record.matchesSubmitted && record.matchesReceipt && record.matchesWorkingTree && record.matchesGitHead, 'Published, submitted, transaction, working-tree and Git source hashes do not all match');
      record.checkedAt = new Date().toISOString();
      record.matched = true;
    } catch (error) {
      record.errors.push(failMessage(error));
      report.errors.push(`${deployment.name}: ${failMessage(error)}`);
    }
  }

  // Detect both chain reorganization and local edits during the sequential reads.
  const finalInfo = validateInfo(await jsonGet('/v2/info'));
  assert(finalInfo.stacksHeight >= context.stacksHeight && finalInfo.burnHeight >= info.burnHeight, 'Node context moved behind the recorded snapshot');
  const finalBlock = validateBlock(await jsonGet(`/extended/v2/blocks/${context.stacksHeight}`), context.stacksHeight, context.stacksHash);
  assert(finalBlock.indexBlockHash === context.indexBlockHash && finalBlock.burnHeight === context.burnHeight, 'Recorded snapshot was reorganized during attestation');
  report.context.reverifiedAt = new Date().toISOString();
  report.context.canonicalAtEnd = true;
  report.git.finalHead = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  assert(report.git.finalHead === commit, 'Git HEAD changed during attestation');
  report.git.sourceStatusAtEnd = git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...entries.map(x => x.path)]).trim();
  assert(!report.git.sourceStatusAtEnd, 'Deployed source files are not clean at the end of attestation');
  assert(sha256(await publicFile(runnerPath)) === report.runnerSourceSha256, 'Runner deployment manifest changed during attestation');
  const finalLedger = JSON.parse(utf8(await publicFile(ledgerPath), ledgerPath));
  assert(JSON.stringify(deploymentRecords(finalLedger, entries, validateStacksAddress)) === JSON.stringify(deployments), 'Public deployment records changed during attestation');
  for (const record of report.contracts) {
    const current = sha256(await publicFile(record.path));
    if (current !== record.workingTreeSha256) {
      record.matched = false;
      record.errors.push('Working source changed during attestation');
      report.errors.push(`${record.name}: working source changed during attestation`);
    }
  }
  assert(report.contracts.length === 7 && report.contracts.every(record => record.matched) && report.errors.length === 0, 'Release source attestation did not pass every check');
  report.result = 'passed';
} catch (error) {
  report.errors.push(failMessage(error));
}

report.finishedAt = new Date().toISOString();
try {
  const destination = resolve(repository, outputPath);
  await mkdir(dirname(destination), { recursive: true });
  assert(await realpath(dirname(destination)) === dirname(destination), 'Attestation output directory must not be a symlink');
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, destination);
  console.log(`${report.result.toUpperCase()}: ${report.contracts.filter(record => record.matched).length}/7 sources matched. ${outputPath}`);
  if (report.errors.length) console.error(report.errors.join('\n'));
} catch (error) {
  console.error(`Could not write separate attestation: ${failMessage(error)}`);
  process.exitCode = 1;
}
if (report.result !== 'passed') process.exitCode = 1;
