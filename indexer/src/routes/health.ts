import { Router } from "express";
import type { Request, Response } from "express";
import { isCached } from "../aggregator.js";
import { getOracleStatus } from "../oracle-pusher.js";
import { evaluateOracleHealth } from "../oracle-health.js";

export const healthRouter = Router();

/** Mask an address for a public endpoint: keep enough to identify, not to dox. */
function maskAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/**
 * Health + oracle observability. Surfaces oracle mode, the age of the last push
 * cycle, whether pushes are landing, and per-wallet gas runway — so a stalled
 * pusher, a failing push, or a draining oracle wallet (each of which lets the
 * on-chain APY go stale and blocks deposits) is visible without log access.
 * Alert on `degraded: true`.
 */
healthRouter.get("/", (_req: Request, res: Response) => {
  const oracle = getOracleStatus();
  const isMainnet = process.env["STACKS_NETWORK"] === "mainnet";

  const h = evaluateOracleHealth({
    mode: oracle.mode,
    ageSeconds: oracle.ageSeconds,
    lastResults: oracle.lastResults,
    lastGas: oracle.lastGas,
  });

  // Always 200 so platform liveness probes don't kill a still-serving indexer
  // in a degraded mode; alert on the `degraded` field instead.
  res.json({
    status: h.degraded ? "degraded" : "ok",
    degraded: h.degraded,
    cached: isCached(),
    network: isMainnet ? "mainnet" : "testnet",
    oracle: {
      mode: oracle.mode,
      lastCycleAgeSeconds: oracle.ageSeconds,
      lastCyclePushed: h.pushed,
      lastCycleTotal: h.total,
      cycleStalled: h.cycleStalled,
      pushFailing: h.pushFailing,
      lowGas: h.lowGas,
      wallets: oracle.lastGas.map((g) => ({
        address: maskAddress(g.address),
        ustx: g.ustx,
        runwayCycles: g.runwayCycles,
        lowGas: g.lowGas,
      })),
    },
  });
});
