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

  // Cross-source sanity guard: flag stale only when the on-chain (oracle-pushed)
  // APY MATERIALLY diverges from the live native feed. A percentage-only check
  // false-positives at low APY — e.g. 17 vs 30 bps reads as "76% deviation" but
  // is only 0.13% apart, immaterial to users — and the on-chain value legitimately
  // lags the native feed because the oracle steps <=40%/cycle (oracle-pusher
  // nextBps). That false "stale" then greys out the whole table (YieldTable
  // `allStale`). Require BOTH a >50% deviation AND a >=100 bps (1% APY) absolute
  // gap, so a genuinely broken/diverged oracle (e.g. 0.5% on-chain vs 8% native)
  // still trips while normal low-rate jitter never does. True on-chain staleness
  // (get-apy returns err once past the staleness window) is handled by
  // `state.isStale` above and is unaffected.
  const MIN_MATERIAL_DEVIATION_BPS = 100;

  let apy_stale = state.isStale;
  if (!apy_stale && is_live_integration) {
    const nativeBps = nativeApy! * 100;
    if (
      exceedsDeviation(state.apyBps, nativeBps, 50) &&
      Math.abs(state.apyBps - nativeBps) >= MIN_MATERIAL_DEVIATION_BPS
    ) {
      console.warn(
        `[${protocol}] cross-source APY deviation: on-chain=${state.apyBps}bps ` +
          `native=${Math.round(nativeBps)}bps`
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
