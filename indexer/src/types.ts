import type { ProtocolId, RiskLevel } from "./registry.js";
export type { ProtocolId, RiskLevel };

export interface NormalizedYield {
  protocol: ProtocolId;
  apy_percent: number;
  risk_level: RiskLevel;
  lock_period_days: number;
  reward_token: string;
  tvl_usd: number;
  fetched_at: number;
  last_updated_block: number;
  apy_stale: boolean;
  is_live_integration: boolean;
  integration_status: "review-required" | "enabled";
  market_type: "sbtc-lending";
  withdrawal_type: "liquidity-dependent";
  risk_assessment: "unreviewed";
  risk_factors: string[];
  apy_source: "on-chain-share-price";
  native_apy_percent: number | null;
  data_status: "fresh" | "unavailable" | "divergent" | "stale";
  /** Whole external protocol TVL, not SatoshiYields deposits or adapter capacity. */
  tvl_scope: "protocol";
  tvl_available: boolean;
}
