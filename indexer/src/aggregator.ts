import type { NormalizedYield } from "./types.js";
import { cache } from "./cache.js";
import { fetchBitflow } from "./fetchers/bitflow.js";
import { fetchAlex } from "./fetchers/alex.js";
import { fetchZest } from "./fetchers/zest.js";
import { fetchVelar } from "./fetchers/velar.js";

const CACHE_KEY = "yields";

export async function aggregateYields(): Promise<NormalizedYield[]> {
  const cached = cache.get<NormalizedYield[]>(CACHE_KEY);
  if (cached !== undefined) return cached;

  const results = await Promise.allSettled([
    fetchBitflow(),
    fetchAlex(),
    fetchZest(),
    fetchVelar(),
  ]);

  const yields = results
    .filter(
      (r): r is PromiseFulfilledResult<NormalizedYield> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value)
    .sort((a, b) => b.apy_percent - a.apy_percent);

  cache.set(CACHE_KEY, yields);
  return yields;
}

export function isCached(): boolean {
  return cache.has(CACHE_KEY);
}

export function invalidateCache(): void {
  cache.del(CACHE_KEY);
}
