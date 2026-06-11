/**
 * Shared builder for a protocol's normalized yield row. Both adapters share this
 * logic; the per-protocol modules are thin config wrappers.
 *
 * Displayed APY is the ON-CHAIN, oracle-pushed value (verifiable + consistent
 * with what vault-v6 gates deposits on). The live native APY is used as a
 * cross-source sanity check and to decide is_live_integration. TVL is the live
 * protocol TVL from DefiLlama.
 */

import type { NormalizedYield, ProtocolId, RiskLevel } from "../types.js";
import { readAdapterOracleState, exceedsDeviation } from "./chain.js";
import { fetchProtocolTvlUsd } from "./defillama.js";
import { HAS_LIVE_APY } from "./native-apy.js";

// On-chain adapter contract name per protocol. Env-overridable so a renamed
// adapter is read/displayed without a code change. Keep in sync with the
// frontend's VITE_*_ADAPTER and the oracle pusher's *_ADAPTER_NAME.
const ADAPTER_NAME: Record<ProtocolId, string> = {
  zest: process.env["ZEST_ADAPTER_NAME"] ?? "zest-earn-adapter",
  hbtc: process.env["HBTC_ADAPTER_NAME"] ?? "hermetica-hbtc-adapter",
};

const RISK: Record<ProtocolId, RiskLevel> = {
  zest: "low",    // overcollateralized lending, principal-protected
  hbtc: "medium", // managed delta-neutral strategy, not principal-guaranteed
};

export async function buildYield(
  protocol: ProtocolId,
  nativeApyFetcher: () => Promise<number | null>
): Promise<NormalizedYield> {
  const adapterName = ADAPTER_NAME[protocol];

  const [stateResult, tvlResult, nativeResult] = await Promise.allSettled([
    readAdapterOracleState(adapterName),
    fetchProtocolTvlUsd(protocol),
    nativeApyFetcher(),
  ]);

  const state =
    stateResult.status === "fulfilled"
      ? stateResult.value
      : { apyBps: 0, lastUpdatedBlock: 0, isStale: true };

  const tvlUsd =
    tvlResult.status === "fulfilled" && tvlResult.value !== null ? tvlResult.value : 0;
  const nativeApy = nativeResult.status === "fulfilled" ? nativeResult.value : null;

  // Live integration requires: the protocol has a live APY source AND we got a
  // number this cycle. (hBTC has no public APY feed, so its on-chain ~8% is shown
  // as a reference/target rate: is_live_integration = false.)
  const is_live_integration = HAS_LIVE_APY[protocol] && nativeApy !== null;

  let apy_stale = state.isStale;
  if (!apy_stale && is_live_integration) {
    if (exceedsDeviation(state.apyBps, nativeApy! * 100, 50)) {
      console.warn(
        `[${protocol}] cross-source APY deviation: on-chain=${state.apyBps}bps native=${Math.round(nativeApy! * 100)}bps`
      );
      apy_stale = true;
    }
  }

  return {
    protocol,
    apy_percent: state.apyBps / 100,
    risk_level: RISK[protocol],
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: tvlUsd,
    fetched_at: Date.now(),
    last_updated_block: state.lastUpdatedBlock,
    apy_stale,
    is_live_integration,
  };
}
