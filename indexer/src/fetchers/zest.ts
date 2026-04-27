import type { NormalizedYield } from "../types.js";
import { readUint, getBtcPriceUsd, satsToUsd } from "./chain.js";

export async function fetchZest(): Promise<NormalizedYield> {
  const [apyBps, totalSats, btcPrice] = await Promise.all([
    readUint("zest-adapter", "get-apy"),
    readUint("zest-adapter", "get-total-deposited"),
    getBtcPriceUsd(),
  ]);

  return {
    protocol: "zest",
    apy_percent: apyBps / 100,
    risk_level: "low",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: satsToUsd(totalSats, btcPrice),
    fetched_at: Date.now(),
  };
}
