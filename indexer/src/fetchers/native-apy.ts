/**
 * Live protocol APY fetchers.
 *
 * Each fetcher returns a real APY in PERCENT, or null when no reliable live
 * source exists for that protocol's sBTC yield right now. null is honest — the
 * UI marks those as "reference rate" (is_live_integration = false) rather than
 * showing a fabricated number.
 *
 *   - Zest : DefiLlama zest-v2 SBTC supply pool apy.                          LIVE.
 *   - hBTC : Hermetica publishes no public APY endpoint; we show the protocol's
 *            ~8% target as a reference rate. (A future enhancement can derive a
 *            realized APY from vault-hbtc-v1-2.get-share-price growth on-chain.) REFERENCE.
 */

import { fetchZestSbtcPool } from "./defillama.js";

export interface NativeApyResult {
  zest: number | null;
  hbtc: number | null;
}

/** Protocols with a genuine live APY source wired in (drives is_live_integration). */
export const HAS_LIVE_APY: Record<keyof NativeApyResult, boolean> = {
  zest: true,
  hbtc: false,
};

/** Clamp to a sane display range so a bad upstream value can never show absurd APY. */
function sane(pct: number | null): number | null {
  if (pct === null || !Number.isFinite(pct) || pct < 0) return null;
  return Math.min(pct, 60); // mirrors the on-chain APY-CAP (6000 bps)
}

/** Zest: DefiLlama-normalized sBTC supply APY (percent). */
export async function fetchZestNativeApy(): Promise<number | null> {
  const pool = await fetchZestSbtcPool();
  return pool ? sane(pool.apyPercent) : null;
}

/** hBTC: no public APY endpoint — the ~8% target is a reference rate. */
export async function fetchHbtcNativeApy(): Promise<number | null> {
  return null;
}

export async function fetchNativeApys(): Promise<NativeApyResult> {
  const [z, h] = await Promise.allSettled([
    fetchZestNativeApy(),
    fetchHbtcNativeApy(),
  ]);
  return {
    zest: z.status === "fulfilled" ? z.value : null,
    hbtc: h.status === "fulfilled" ? h.value : null,
  };
}
