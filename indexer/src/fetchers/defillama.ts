/**
 * DefiLlama data source — used for protocol TVL only.
 *
 *   - Protocol TVL:  https://api.llama.fi/tvl/{slug}  -> number (USD)
 *
 * (APY is no longer sourced here — the Zest supply APY is derived from the
 * vault's on-chain share-price growth in src/share-price.ts, which is exact and
 * tied to the precise vault we deposit into.)
 */

const TIMEOUT_MS = 8_000;

const CACHE_MS = 60_000;
type Cached<T> = { at: number; value: T };
const tvlCache = new Map<string, Cached<number | null>>();

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Live protocol TVL in USD by DefiLlama slug (or null when unreachable). */
export async function fetchProtocolTvlUsd(slug: string): Promise<number | null> {
  const hit = tvlCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const data = await getJson(`https://api.llama.fi/tvl/${slug}`);
  const n = typeof data === "number" ? data : typeof data === "string" ? Number(data) : NaN;
  const value = Number.isFinite(n) && n >= 0 ? n : null;
  tvlCache.set(slug, { at: Date.now(), value });
  return value;
}
