import { MAX_CONTEXT_AGE_MS, SIGNET_GENESIS, type BabylonContext, type BitcoinWalletBinding } from './types.js';

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : value;
  ensure(typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max, `Invalid ${name}`);
  return n;
}
export function hex(value: unknown, bytes: number, name: string): string {
  ensure(typeof value === 'string' && new RegExp(`^[a-fA-F0-9]{${bytes * 2}}$`).test(value), `Invalid ${name}`);
  return value.toLowerCase();
}
export function freshness(timeMs: number, now = Date.now()): void {
  ensure(Number.isSafeInteger(timeMs) && timeMs <= now + 5_000 && now - timeMs <= MAX_CONTEXT_AGE_MS, 'Network observation is stale or future dated');
}
export function checkContext(context: BabylonContext, now = Date.now()): void {
  ensure(context.network === 'signet' && context.genesisHash === SIGNET_GENESIS && context.babylonChainId === 'bbn-test-6', 'Bitcoin/Babylon chain identity mismatch');
  freshness(context.fetchedAtMs, now);
  integer(context.bitcoinTipHeight, 'Bitcoin tip', 1);
  integer(context.babylonBitcoinTipHeight, 'Babylon Bitcoin tip', 1);
  ensure(context.babylonBitcoinTipHeight <= context.bitcoinTipHeight && context.bitcoinTipHeight - context.babylonBitcoinTipHeight <= 144, 'Babylon Bitcoin light client is not synchronized');
}
export function checkWalletNetwork(wallet: BitcoinWalletBinding): void {
  ensure(wallet.network === 'signet' && wallet.genesisHash === SIGNET_GENESIS, 'Wallet must explicitly identify Bitcoin Signet; a tb1 prefix alone is insufficient');
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export function parseBtcAmount(value: string): number {
  ensure(typeof value === 'string' && /^(0|[1-9]\d{0,7})(\.\d{1,8})?$/.test(value), 'BTC amount must be a positive decimal with at most eight places');
  const [whole, fraction = ''] = value.split('.');
  const sats = BigInt(whole!) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
  ensure(sats > 0n && sats <= 2_100_000_000_000_000n, 'BTC amount out of range');
  return Number(sats);
}
export function satsToBtc(sats: number): string {
  integer(sats, 'satoshis');
  return `${Math.floor(sats / 100_000_000)}.${String(sats % 100_000_000).padStart(8, '0')}`;
}
