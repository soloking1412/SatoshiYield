import type { NormalizedYield } from "../types.js";
import { readUint, getBtcPriceUsd, satsToUsd } from "./chain.js";

export async function fetchBitflow(): Promise<NormalizedYield> {
  const [apyBps, totalSats, btcPrice] = await Promise.all([
    readUint("bitflow-adapter", "get-apy"),
    readUint("bitflow-adapter", "get-total-deposited"),
    getBtcPriceUsd(),
  ]);

  return {
    protocol: "bitflow",
    apy_percent: apyBps / 100,
    risk_level: "medium",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: satsToUsd(totalSats, btcPrice),
    fetched_at: Date.now(),
  };
}
