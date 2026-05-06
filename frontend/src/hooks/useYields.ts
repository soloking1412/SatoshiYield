import { useQuery } from "@tanstack/react-query";
import type { NormalizedYield, ProtocolId, RiskLevel } from "../types/yield.js";

/**
 * Base URL for the yield indexer. In dev, VITE_INDEXER_URL is unset and
 * `/api/yields` is proxied to the local indexer via vite.config.ts. In
 * production, set VITE_INDEXER_URL to the deployed indexer origin.
 */
const INDEXER_BASE: string = import.meta.env.VITE_INDEXER_URL ?? "";

const VALID_PROTOCOLS = new Set<string>(["bitflow", "alex", "zest", "velar"]);
const VALID_RISK = new Set<string>(["low", "medium", "high"]);

/** Runtime-validate each yield entry from the API. */
function validateYield(raw: unknown): NormalizedYield | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const protocol = obj["protocol"];
  const apy = obj["apy_percent"];
  const risk = obj["risk_level"];
  const lock = obj["lock_period_days"];
  const token = obj["reward_token"];
  const tvl = obj["tvl_usd"];
  const fetched = obj["fetched_at"];
  const lastBlock = obj["last_updated_block"];
  const apyStale = obj["apy_stale"];
  const isLive = obj["is_live_integration"];

  if (
    typeof protocol !== "string" || !VALID_PROTOCOLS.has(protocol) ||
    typeof apy !== "number" || !Number.isFinite(apy) ||
    typeof risk !== "string" || !VALID_RISK.has(risk) ||
    typeof lock !== "number" ||
    typeof token !== "string" ||
    typeof tvl !== "number" ||
    typeof fetched !== "number"
  ) {
    return null;
  }

  return {
    protocol: protocol as ProtocolId,
    apy_percent: apy,
    risk_level: risk as RiskLevel,
    lock_period_days: lock,
    reward_token: token,
    tvl_usd: tvl,
    fetched_at: fetched,
    last_updated_block: typeof lastBlock === "number" ? lastBlock : 0,
    apy_stale: typeof apyStale === "boolean" ? apyStale : false,
    is_live_integration: typeof isLive === "boolean" ? isLive : false,
  };
}

async function fetchYields(): Promise<NormalizedYield[]> {
  const res = await fetch(`${INDEXER_BASE}/api/yields`);
  if (!res.ok) throw new Error(`Yields API returned ${res.status}`);

  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Yields response is not an array");

  return data.map(validateYield).filter((y): y is NormalizedYield => y !== null);
}

export function useYields() {
  return useQuery({
    queryKey: ["yields"],
    queryFn: fetchYields,
    refetchInterval: 5 * 60 * 1000, // re-fetch every 5 min to stay current
    staleTime: 60 * 1000,
  });
}
