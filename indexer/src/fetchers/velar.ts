import type { NormalizedYield } from "../types.js";
import { readUint, getBtcPriceUsd, satsToUsd } from "./chain.js";

export async function fetchVelar(): Promise<NormalizedYield> {
  const [apyBps, totalSats, btcPrice] = await Promise.all([
    readUint("velar-adapter", "get-apy"),
    readUint("velar-adapter", "get-total-deposited"),
    getBtcPriceUsd(),
  ]);

  return {
    protocol: "velar",
    apy_percent: apyBps / 100,
    risk_level: "high",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: satsToUsd(totalSats, btcPrice),
    fetched_at: Date.now(),
  };
}
