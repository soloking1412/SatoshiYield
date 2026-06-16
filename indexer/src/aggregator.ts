import type { NormalizedYield, ProtocolId } from "./types.js";
import { ADAPTER_REGISTRY } from "./registry.js";
import { cache } from "./cache.js";
import { buildYield } from "./fetchers/build.js";

const CACHE_KEY = "yields";

export async function aggregateYields(): Promise<NormalizedYield[]> {
  const cached = cache.get<NormalizedYield[]>(CACHE_KEY);
  if (cached !== undefined) return cached;

  const protocols = Object.keys(ADAPTER_REGISTRY) as ProtocolId[];
  const results = await Promise.allSettled(
    protocols.map((p) => buildYield(p, ADAPTER_REGISTRY[p]))
  );

  const yields = results
    .filter(
      (r): r is PromiseFulfilledResult<NormalizedYield> => r.status === "fulfilled"
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
