import type { NormalizedYield } from "../types.js";
import { readUint, getBtcPriceUsd, satsToUsd } from "./chain.js";

export async function fetchAlex(): Promise<NormalizedYield> {
  const [apyBps, totalSats, btcPrice] = await Promise.all([
    readUint("alex-adapter", "get-apy"),
    readUint("alex-adapter", "get-total-deposited"),
    getBtcPriceUsd(),
  ]);

  return {
    protocol: "alex",
    apy_percent: apyBps / 100,
    risk_level: "medium",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: satsToUsd(totalSats, btcPrice),
    fetched_at: Date.now(),
  };
}
