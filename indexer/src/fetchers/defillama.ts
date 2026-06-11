/**
 * DefiLlama data source — the reliable, normalized backbone for live protocol
 * data. Free, no key, broad Stacks coverage.
 *
 *   - Protocol TVL:  https://api.llama.fi/tvl/{slug}        -> number (USD)
 *   - Pool APY/TVL:  https://yields.llama.fi/chart/{poolId} -> time series
 *
 * We deliberately use the small per-pool /chart endpoint (a few KB) rather than
 * the multi-MB /pools list, so each refresh stays cheap.
 */

import type { ProtocolId } from "../types.js";

const TIMEOUT_MS = 8_000;

/** DefiLlama protocol slugs for each adapter's underlying protocol. */
export const TVL_SLUG: Record<ProtocolId, string> = {
  zest: "zest-v2",
  hbtc: "hermetica",
};

/** Zest's sBTC supply pool on DefiLlama (project zest-v2, symbol SBTC). */
const ZEST_SBTC_POOL = "f003d6df-fb8f-4a74-8cfb-aee8cc44f433";

// --- light module cache so the per-protocol fetchers + oracle pusher don't
//     each re-hit DefiLlama within the same refresh window ---
const CACHE_MS = 60_000;
type Cached<T> = { at: number; value: T };
const tvlCache = new Map<string, Cached<number | null>>();
let zestCache: Cached<{ apyPercent: number; tvlUsd: number } | null> | null = null;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Live protocol TVL in USD (or null when DefiLlama is unreachable). */
export async function fetchProtocolTvlUsd(protocol: ProtocolId): Promise<number | null> {
  const slug = TVL_SLUG[protocol];
  const hit = tvlCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const data = await getJson(`https://api.llama.fi/tvl/${slug}`);
  const n = typeof data === "number" ? data : typeof data === "string" ? Number(data) : NaN;
  const value = Number.isFinite(n) && n >= 0 ? n : null;
  tvlCache.set(slug, { at: Date.now(), value });
  return value;
}

/** Live Zest sBTC supply APY (%) and pool TVL from the per-pool chart. */
export async function fetchZestSbtcPool(): Promise<{ apyPercent: number; tvlUsd: number } | null> {
  if (zestCache && Date.now() - zestCache.at < CACHE_MS) return zestCache.value;

  const data = await getJson(`https://yields.llama.fi/chart/${ZEST_SBTC_POOL}`);
  let value: { apyPercent: number; tvlUsd: number } | null = null;
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    const pts = (data as { data: Array<{ apy?: unknown; tvlUsd?: unknown }> }).data;
    const last = pts[pts.length - 1];
    if (last && typeof last.apy === "number" && Number.isFinite(last.apy)) {
      value = {
        apyPercent: Math.max(0, last.apy),
        tvlUsd: typeof last.tvlUsd === "number" ? last.tvlUsd : 0,
      };
    }
  }
  zestCache = { at: Date.now(), value };
  return value;
}
