/**
 * Realized Zest sBTC supply APY from on-chain SHARE-PRICE growth.
 *
 * The Zest vault (v0-vault-sbtc) is an ERC-4626-style lending vault: one zsBTC
 * share is worth `convert-to-assets(SHARE_UNIT) / SHARE_UNIT` sBTC, and that
 * price only rises as supply interest accrues. The annualized growth of that
 * price IS the realized supply APY — exact, trustless, and tied to the exact
 * vault we deposit into (no DefiLlama v0/v2 ambiguity).
 *
 * We keep a small rolling history of (timestamp, price) snapshots and annualize
 * the growth from the oldest snapshot at least MIN_WINDOW old. Until that much
 * history exists, we return null and the caller holds the on-chain last-known
 * value / reference rate (honest: we never fabricate a realized number).
 *
 * History is in-memory (survives across cycles on the always-on instance) with
 * optional file persistence via ZEST_SHARE_PRICE_FILE so it can survive a
 * restart when a persistent disk is mounted. On a cold start with no history,
 * the on-chain oracle simply holds its last pushed value.
 */

import { uintCV, cvToHex } from "@stacks/transactions";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { readUintFromContract } from "./fetchers/chain.js";

const ZEST_VAULT_ADDRESS = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";
const ZEST_VAULT_NAME = "v0-vault-sbtc";
const SHARE_UNIT = 100_000_000; // convert-to-assets(1e8 shares) -> assets; price = result / 1e8

const MIN_WINDOW_MS = 24 * 60 * 60 * 1000;       // need >= 24h before reporting a realized APY
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;  // retain up to 30 days of snapshots
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const PERSIST_FILE = process.env["ZEST_SHARE_PRICE_FILE"]; // optional

export interface Snap {
  t: number; // epoch ms
  p: number; // share price (assets per share)
}

let history: Snap[] = [];
let loaded = false;

/** Test hook: seed/replace the in-memory history. */
export function __setHistory(snaps: Snap[]): void {
  history = snaps.slice();
  loaded = true;
}

/** Current share price (assets per share) from the live vault. */
export async function readZestSharePrice(): Promise<number> {
  const assets = await readUintFromContract(
    ZEST_VAULT_ADDRESS,
    ZEST_VAULT_NAME,
    "convert-to-assets",
    [cvToHex(uintCV(SHARE_UNIT))]
  );
  return assets / SHARE_UNIT;
}

/**
 * PURE: realized APY (percent) from snapshots + the current price, or null when
 * there isn't yet a snapshot at least MIN_WINDOW old. The price only rises, so a
 * non-positive growth is treated as noise/reset (null), never a negative APY.
 */
export function computeRealizedApy(
  snaps: Snap[],
  nowPrice: number,
  now: number
): number | null {
  if (!Number.isFinite(nowPrice) || nowPrice <= 0) return null;
  const anchor = snaps
    .filter((s) => Number.isFinite(s.p) && s.p > 0 && now - s.t >= MIN_WINDOW_MS)
    .sort((a, b) => a.t - b.t)[0]; // oldest snapshot >= MIN_WINDOW old -> longest, smoothest window
  if (!anchor) return null;

  const elapsed = now - anchor.t;
  if (elapsed <= 0) return null;
  const growth = nowPrice / anchor.p;
  if (growth <= 0) return null;

  const apy = (Math.pow(growth, YEAR_MS / elapsed) - 1) * 100;
  if (!Number.isFinite(apy) || apy < 0) return null;
  return apy;
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  if (!PERSIST_FILE) return;
  try {
    const raw = await fs.readFile(PERSIST_FILE, "utf8");
    const arr: unknown = JSON.parse(raw);
    if (Array.isArray(arr)) {
      history = arr.filter(
        (s): s is Snap =>
          typeof s === "object" && s !== null &&
          typeof (s as Snap).t === "number" && typeof (s as Snap).p === "number"
      );
    }
  } catch {
    /* no file yet — start empty */
  }
}

async function persist(): Promise<void> {
  if (!PERSIST_FILE) return;
  try {
    await fs.mkdir(dirname(PERSIST_FILE), { recursive: true });
    await fs.writeFile(PERSIST_FILE, JSON.stringify(history));
  } catch {
    /* best-effort; ephemeral fs is fine */
  }
}

/**
 * Read the current share price, fold it into the rolling history, and return the
 * realized APY (percent) or null if there isn't yet >= MIN_WINDOW of history.
 */
export async function fetchZestRealizedApy(): Promise<number | null> {
  await ensureLoaded();

  let price: number;
  try {
    price = await readZestSharePrice();
  } catch {
    return null; // read failed -> caller holds last-known-good / reference
  }
  if (!Number.isFinite(price) || price <= 0) return null;

  const now = Date.now();
  const apy = computeRealizedApy(history, price, now);

  history = [...history.filter((s) => now - s.t <= MAX_WINDOW_MS), { t: now, p: price }];
  await persist();

  return apy;
}
