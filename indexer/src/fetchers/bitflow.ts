import type { NormalizedYield } from "../types.js";
import {
  readAdapterOracleState,
  readUint,
  getBtcPriceUsd,
  satsToUsd,
  exceedsDeviation,
} from "./chain.js";

export async function fetchBitflow(): Promise<NormalizedYield> {
  const [onChainResult, totalSatsResult, btcPriceResult, nativeApyResult] =
    await Promise.allSettled([
      readAdapterOracleState("bitflow-adapter"),
      readUint("bitflow-adapter", "get-total-deposited"),
      getBtcPriceUsd(),
      fetchBitflowNativeApy(),
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
        `[bitflow] cross-source APY deviation: on-chain=${state.apyBps}bps native=${Math.round(nativeApy * 100)}bps`
      );
      apy_stale = true;
    }
  }

  return {
    protocol: "bitflow",
    apy_percent: state.apyBps / 100,
    risk_level: "medium",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: satsToUsd(totalSats, btcPrice),
    fetched_at: Date.now(),
    last_updated_block: state.lastUpdatedBlock,
    apy_stale,
  };
}

async function fetchBitflowNativeApy(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.bitflow.finance/v1/pools/apy",
      { signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "apy" in data &&
      typeof (data as Record<string, unknown>)["apy"] === "number"
    ) {
      return (data as { apy: number }).apy;
    }
    return null;
  } catch {
    return null;
  }
}
