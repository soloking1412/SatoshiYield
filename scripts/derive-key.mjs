/**
 * Stacks private key derivation from BIP39 mnemonic.
 * Derivation path: m/44'/5757'/0'/0/0
 */

import { createHmac, pbkdf2Sync } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const MNEMONIC = 'holiday scatter legal caution width truck swap assist gym example table immense';
const PASSPHRASE = '';
const TARGET = 'ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1';

// BIP39: mnemonic → 64-byte seed
function mnemonicToSeed(mnemonic, passphrase = '') {
  const mn = Buffer.from(mnemonic.normalize('NFKD'), 'utf8');
  const salt = Buffer.from(('mnemonic' + passphrase).normalize('NFKD'), 'utf8');
  return pbkdf2Sync(mn, salt, 2048, 64, 'sha512');
}

function hmacSha512(key, data) {
  return createHmac('sha512', key).update(data).digest();
}

const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

function addModN(a, b) {
  const result = (a + b) % N;
  return Buffer.from(result.toString(16).padStart(64, '0'), 'hex');
}

function bufToBig(buf) {
  return BigInt('0x' + buf.toString('hex'));
}

// BIP32 master from seed
function masterFromSeed(seed) {
  const I = hmacSha512(Buffer.from('Bitcoin seed', 'utf8'), seed);
  return { key: I.slice(0, 32), chainCode: Buffer.from(I.slice(32)) };
}

// BIP32 hardened child
function deriveHardened(parentKey, parentChainCode, index) {
  const idx = 0x80000000 + index;
  const data = Buffer.alloc(37);
  data[0] = 0x00;
  Buffer.from(parentKey).copy(data, 1);
  data.writeUInt32BE(idx, 33);
  const I = hmacSha512(parentChainCode, data);
  const IL = I.slice(0, 32);
  const childKey = addModN(bufToBig(IL), bufToBig(Buffer.from(parentKey)));
  return { key: childKey, chainCode: Buffer.from(I.slice(32)) };
}

// BIP32 normal child
function deriveNormal(parentKey, parentChainCode, index) {
  const secp = require('/Users/soloking/SatoshiYield/frontend/node_modules/@noble/secp256k1');
  const pubKey = secp.getPublicKey(parentKey, true); // compressed 33 bytes
  const data = Buffer.alloc(37);
  Buffer.from(pubKey).copy(data, 0);
  data.writeUInt32BE(index, 33);
  const I = hmacSha512(parentChainCode, data);
  const IL = I.slice(0, 32);
  const childKey = addModN(bufToBig(IL), bufToBig(Buffer.from(parentKey)));
  return { key: childKey, chainCode: Buffer.from(I.slice(32)) };
}

function derivePath(seed, path) {
  let { key, chainCode } = masterFromSeed(seed);
  const segments = path.replace('m/', '').split('/');
  for (const seg of segments) {
    const hardened = seg.endsWith("'");
    const index = parseInt(hardened ? seg.slice(0, -1) : seg);
    if (hardened) {
      ({ key, chainCode } = deriveHardened(key, chainCode, index));
    } else {
      ({ key, chainCode } = deriveNormal(key, chainCode, index));
    }
  }
  return key;
}

// Stacks address from private key
function toAddress(keyBuf) {
  const { getAddressFromPrivateKey } = require('/Users/soloking/SatoshiYield/frontend/node_modules/@stacks/transactions/dist/keys.js');
  const hex = keyBuf.toString('hex') + '01'; // compressed
  return getAddressFromPrivateKey(hex, 'testnet');
}

// ---------- Main ----------
console.log('\nDeriving Stacks private key...\n');
const seed = mnemonicToSeed(MNEMONIC, PASSPHRASE);

const paths = [
  "m/44'/5757'/0'/0/0",
  "m/44'/5757'/0'/0",
  "m/44'/5757'/0'",
  "m/44'/0'/0'/0/0",
  "m/44'/5757'/0'/0/1",
  "m/44'/5757'/1'/0/0",
];

const { getAddressFromPrivateKey } = require('/Users/soloking/SatoshiYield/frontend/node_modules/@stacks/transactions/dist/keys.js');

for (const path of paths) {
  try {
    const key = derivePath(seed, path);
    const hex = key.toString('hex') + '01';
    const address = getAddressFromPrivateKey(hex, 'testnet');
    const match = address === TARGET ? ' ← MATCH ✓' : '';
    console.log(`Path ${path.padEnd(26)} → ${address}${match}`);
    if (match) {
      console.log('\n╔══════════════════════════════════════════════╗');
      console.log('  PRIVATE KEY: 0x' + hex);
      console.log('╚══════════════════════════════════════════════╝\n');
    }
  } catch (e) {
    console.log(`Path ${path.padEnd(26)} → ERROR: ${e.message}`);
  }
}
