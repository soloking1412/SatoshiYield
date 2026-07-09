import type { OracleGas, PushResult } from "./oracle-pusher.js";

/**
 * Pure oracle-health evaluation, split out from the /api/health route so the
 * degraded-detection logic is deterministic and unit-testable without a server
 * or live chain. The route feeds it a snapshot of the oracle status; monitoring
 * alerts on `degraded`.
 */

// Cycle is degraded once the last push is older than this. The scheduler runs
// every 30 min, so 70 min (> 2 cycles) flags a stalled pusher well before the
// on-chain APY hits the ~5.5h staleness window that blocks deposits.
const STALE_CYCLE_SECONDS = 70 * 60;

export interface OracleSnapshot {
  mode: "dual" | "single" | "disabled";
  ageSeconds: number | null;
  lastResults: PushResult[];
  lastGas: OracleGas[];
}

export interface OracleHealth {
  degraded: boolean;
  cycleStalled: boolean;
  /** Last cycle attempted pushes but not all landed (e.g. out of gas). */
  pushFailing: boolean;
  /** An oracle wallet is running low on STX and will soon stop pushing. */
  lowGas: boolean;
  pushed: number;
  total: number;
}

/**
 * Degraded when the oracle can't sustain 2-of-3 consensus (single/disabled),
 * the push cycle has stalled, the last cycle's pushes are failing, or a wallet
 * is low on gas. Each leads to the on-chain APY going stale and deposits being
 * blocked, so each warrants an alert.
 */
export function evaluateOracleHealth(s: OracleSnapshot): OracleHealth {
  const pushed = s.lastResults.filter((r) => r.pushed).length;
  const total = s.lastResults.length;

  const cycleStalled =
    s.ageSeconds === null || s.ageSeconds > STALE_CYCLE_SECONDS;
  const pushFailing = total > 0 && pushed < total;
  const lowGas = s.lastGas.some((g) => g.lowGas);

  const degraded =
    s.mode !== "dual" || cycleStalled || pushFailing || lowGas;

  return { degraded, cycleStalled, pushFailing, lowGas, pushed, total };
}
