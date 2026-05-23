import { Router } from "express";
import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { runOracleCycle } from "../oracle-pusher.js";
import { invalidateCache } from "../aggregator.js";

export const oracleRouter = Router();

/**
 * Constant-time bearer-token check. Returns false if either side is missing
 * or the lengths differ (timingSafeEqual throws on length mismatch).
 */
function authorized(req: Request): boolean {
  const expected = process.env["ADMIN_TOKEN"] ?? "";
  if (expected.length === 0) return false;

  const header = req.headers.authorization ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Manually triggers one oracle push cycle. Designed to be called by an
 * external scheduler (GitHub Actions, cron-job.org, etc.) every ~30 minutes
 * so APY refresh does not depend on the indexer process staying awake.
 *
 * Returns a per-adapter result list so the caller's log shows exactly which
 * pushes succeeded and which were skipped (and why).
 */
oracleRouter.post("/push", async (req: Request, res: Response) => {
  if (!authorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const results = await runOracleCycle();
  invalidateCache();

  const pushed  = results.filter((r) => r.pushed);
  const skipped = results.filter((r) => !r.pushed);

  res.status(skipped.length === results.length ? 502 : 200).json({
    cycle_at: new Date().toISOString(),
    pushed_count: pushed.length,
    skipped_count: skipped.length,
    results,
  });
});
