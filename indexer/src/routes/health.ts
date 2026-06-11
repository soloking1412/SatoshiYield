import { Router } from "express";
import type { Request, Response } from "express";
import { isCached } from "../aggregator.js";
import { getOracleStatus } from "../oracle-pusher.js";

export const healthRouter = Router();

/**
 * Health + oracle observability. Surfaces oracle mode and the age of the last
 * push cycle so single-oracle degradation or a stalled pusher (which lets the
 * on-chain APY go stale and blocks deposits) is visible without log access.
 */
// Cycle is considered degraded once the last push is older than this. The
// scheduler runs every 30 min, so 70 min (> 2 cycles) flags a stalled pusher
// well before the on-chain APY hits the ~5.5h staleness window that blocks
// deposits. Alert on `degraded: true`.
const STALE_CYCLE_SECONDS = 70 * 60;

healthRouter.get("/", (_req: Request, res: Response) => {
  const oracle = getOracleStatus();
  const pushed = oracle.lastResults.filter((r) => r.pushed).length;

  // Degraded = the oracle cannot sustain 2-of-3 consensus (single/disabled mode)
  // or the push cycle has stalled. Either leads to on-chain APY going stale and
  // deposits being blocked, so it warrants an alert.
  const isMainnet = process.env["STACKS_NETWORK"] === "mainnet";
  const cycleStalled =
    oracle.ageSeconds === null || oracle.ageSeconds > STALE_CYCLE_SECONDS;
  const degraded = oracle.mode !== "dual" || cycleStalled;

  // Always 200 so platform liveness probes don't kill a still-serving indexer
  // in single-oracle mode; alert on the `degraded` field instead.
  res.json({
    status: degraded ? "degraded" : "ok",
    degraded,
    cached: isCached(),
    network: isMainnet ? "mainnet" : "testnet",
    oracle: {
      mode: oracle.mode,
      lastCycleAgeSeconds: oracle.ageSeconds,
      lastCyclePushed: pushed,
      lastCycleTotal: oracle.lastResults.length,
      cycleStalled,
    },
  });
});
