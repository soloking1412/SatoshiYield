/**
 * Generic yield-row builder. Called once per registered adapter per cycle.
 * Takes the registry entry directly — no hardcoded per-protocol records here.
 */

import type { AdapterEntry, ProtocolId } from "../registry.js";
import { adapterName } from "../registry.js";
import type { NormalizedYield } from "../types.js";
import { readAdapterOracleState, exceedsDeviation } from "./chain.js";
import { fetchProtocolTvlUsd } from "./defillama.js";

export async function buildYield(
  protocol: ProtocolId,
  entry: AdapterEntry
): Promise<NormalizedYield> {
  const name = adapterName(protocol);

  const [stateResult, tvlResult, nativeResult] = await Promise.allSettled([
    readAdapterOracleState(name),
    fetchProtocolTvlUsd(entry.defillamaSlug),
    entry.fetchNativeApy(),
  ]);

  const state =
    stateResult.status === "fulfilled"
      ? stateResult.value
      : { apyBps: 0, lastUpdatedBlock: 0, isStale: true };

  const tvlUsd =
    tvlResult.status === "fulfilled" && tvlResult.value !== null
      ? tvlResult.value
      : 0;

  const nativeApy =
    nativeResult.status === "fulfilled" ? nativeResult.value : null;

  const is_live_integration = entry.hasLiveApy && nativeApy !== null;

  let apy_stale = state.isStale;
  if (!apy_stale && is_live_integration) {
    if (exceedsDeviation(state.apyBps, nativeApy! * 100, 50)) {
      console.warn(
        `[${protocol}] cross-source APY deviation: on-chain=${state.apyBps}bps ` +
          `native=${Math.round(nativeApy! * 100)}bps`
      );
      apy_stale = true;
    }
  }

  return {
    protocol,
    apy_percent: state.apyBps / 100,
    risk_level: entry.risk,
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: tvlUsd,
    fetched_at: Date.now(),
    last_updated_block: state.lastUpdatedBlock,
    apy_stale,
    is_live_integration,
  };
}
