/**
 * Per-protocol native APY fetchers.
 *
 * Each function returns the real APY in PERCENT, or null when no reliable
 * live source exists. null is honest — the oracle holds the last on-chain
 * value instead of pushing a fabricated number.
 *
 * Add a new fetchXxxNativeApy() here for each new adapter, then wire it
 * into ADAPTER_REGISTRY in registry.ts.
 */

import { fetchZestRealizedApy } from "../share-price.js";

function sane(pct: number | null): number | null {
  if (pct === null || !Number.isFinite(pct) || pct < 0) return null;
  return Math.min(pct, 60); // mirrors the on-chain APY-CAP (6000 bps)
}

/**
 * Zest: realized sBTC supply APY from the live vault's on-chain share-price
 * growth (exact + trustless, tied to the exact vault we deposit into). Returns
 * null until >= 24h of history exists (caller holds last-known-good / reference).
 */
export async function fetchZestNativeApy(): Promise<number | null> {
  return sane(await fetchZestRealizedApy());
}

/** hBTC: no public APY endpoint — ~8% target is a reference rate. */
export async function fetchHbtcNativeApy(): Promise<number | null> {
  return null;
}
