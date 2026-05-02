export type ProtocolId = "bitflow" | "alex" | "zest" | "velar";

export type RiskLevel = "low" | "medium" | "high";

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
}
