/**
 * Per-protocol native APY fetchers.
 *
 * Each function returns the real APY in PERCENT, or null when no reliable
 * live source exists. A missing or invalid feed must stop oracle publication;
 * re-publishing an old value would incorrectly refresh its freshness timestamp.
 *
 * Add a new fetchXxxNativeApy() here for each new adapter, then wire it
 * into ADAPTER_REGISTRY in registry.ts.
 */

import { fetchZestRealizedApy } from "../share-price.js";

function sane(pct: number | null): number | null {
  if (pct === null || !Number.isFinite(pct) || pct < 0 || pct > 60) return null;
  return pct; // reject anomalies instead of laundering them into the APY cap
}

/**
 * Zest: realized sBTC supply APY from the live vault's on-chain share-price
 * growth, tied to the configured vault. RPC and sampling remain trust assumptions.
 * Returns null until >= 24h of history exists; no bootstrap APY is published.
 */
export async function fetchZestNativeApy(): Promise<number | null> {
  return sane(await fetchZestRealizedApy());
}

/** hBTC: no public APY endpoint — ~8% target is a reference rate. */
export async function fetchHbtcNativeApy(): Promise<number | null> {
  return null;
}
