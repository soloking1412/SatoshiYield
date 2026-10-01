import { useQuery } from "@tanstack/react-query";
import { PROTOCOLS } from "../constants/protocols.js";
import type { NormalizedYield, ProtocolId, RiskLevel } from "../types/yield.js";
const INDEXER_BASE: string = import.meta.env.VITE_INDEXER_URL ?? "";
const VALID_RISK = new Set<string>(["low", "medium", "high"]);
export const MAX_YIELD_AGE_MS = 10 * 60 * 1000;
/** Untrusted indexer fields cannot enable an integration or erase stale state. */
export function validateYield(raw: unknown, now = Date.now()): NormalizedYield | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const finiteNonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (typeof o.protocol !== "string" || !Object.hasOwn(PROTOCOLS,o.protocol) ||
    typeof o.apy_percent !== "number" || !Number.isFinite(o.apy_percent) || o.apy_percent < -100 || o.apy_percent > 10000 ||
    typeof o.risk_level !== "string" || !VALID_RISK.has(o.risk_level) ||
    !finiteNonnegative(o.lock_period_days) || !finiteNonnegative(o.tvl_usd) ||
    !finiteNonnegative(o.fetched_at) || o.fetched_at > now + 30_000 ||
    o.reward_token !== "sBTC") return null;
  const lastBlock = o.last_updated_block;
  const validBlock = typeof lastBlock === "number" && Number.isSafeInteger(lastBlock) && lastBlock > 0;
  const stale = o.apy_stale !== false || !validBlock || now - o.fetched_at > MAX_YIELD_AGE_MS;
  return { protocol:o.protocol as ProtocolId, apy_percent:o.apy_percent, risk_level:o.risk_level as RiskLevel,
    lock_period_days:o.lock_period_days, reward_token:o.reward_token, tvl_usd:o.tvl_usd, fetched_at:o.fetched_at,
    last_updated_block:validBlock ? lastBlock : 0, apy_stale:stale,
    // Contract validation controls deposits; API data cannot declare a reviewed integration.
    is_live_integration:false,
  };
}
async function fetchYields(): Promise<NormalizedYield[]> {
  const res = await fetch(`${INDEXER_BASE}/api/yields`,{signal:AbortSignal.timeout(10_000)});
  if (!res.ok) throw new Error(`Yields API returned ${res.status}`);
  const data:unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Yields response is not an array");
  const seen = new Set<string>();
  return data.map((x)=>validateYield(x)).filter((y):y is NormalizedYield => {
    if(!y || seen.has(y.protocol)) return false;
    seen.add(y.protocol); return true;
  });
}
export function useYields() {
  return useQuery({queryKey:["yields",INDEXER_BASE],queryFn:fetchYields,refetchInterval:60_000,staleTime:30_000});
}
