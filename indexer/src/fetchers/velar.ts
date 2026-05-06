import type { NormalizedYield } from "../types.js";
import {
  readAdapterOracleState,
  readUint,
  getBtcPriceUsd,
  satsToUsd,
  exceedsDeviation,
} from "./chain.js";
import { fetchVelarNativeApy } from "./native-apy.js";

export async function fetchVelar(): Promise<NormalizedYield> {
  const [onChainResult, totalSatsResult, btcPriceResult, nativeApyResult] =
    await Promise.allSettled([
      readAdapterOracleState("velar-adapter"),
      readUint("velar-adapter", "get-total-deposited"),
      getBtcPriceUsd(),
      fetchVelarNativeApy(),
    ]);

  const state =
    onChainResult.status === "fulfilled"
      ? onChainResult.value
      : { apyBps: 0, lastUpdatedBlock: 0, isStale: true };

  const totalSats = totalSatsResult.status === "fulfilled" ? totalSatsResult.value : 0;
  const btcPrice = btcPriceResult.status === "fulfilled" ? btcPriceResult.value : 83_000;
  const nativeApy = nativeApyResult.status === "fulfilled" ? nativeApyResult.value : null;

  let apy_stale = state.isStale;
  if (!apy_stale && nativeApy !== null) {
    const crossDeviation = exceedsDeviation(state.apyBps, nativeApy * 100, 50);
    if (crossDeviation) {
      console.warn(
        `[velar] cross-source APY deviation: on-chain=${state.apyBps}bps native=${Math.round(nativeApy * 100)}bps`
      );
      apy_stale = true;
    }
  }

  return {
    protocol: "velar",
    apy_percent: state.apyBps / 100,
    risk_level: "high",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: satsToUsd(totalSats, btcPrice),
    fetched_at: Date.now(),
    last_updated_block: state.lastUpdatedBlock,
    apy_stale,
    is_live_integration: false,
  };
}
