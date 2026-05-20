import { Router } from "express";
import type { Request, Response } from "express";
import { isCached } from "../aggregator.js";

export const healthRouter = Router();

/**
 * Oracle operating mode — surfaced so single-oracle degradation (which lets
 * on-chain APY go stale and blocks deposits) is observable without log access.
 */
function oracleMode(): "dual" | "single" | "disabled" {
  if (!process.env["ORACLE_PRIVATE_KEY"]) return "disabled";
  return process.env["ORACLE_PRIVATE_KEY_2"] ? "dual" : "single";
}

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    cached: isCached(),
    network: process.env["STACKS_NETWORK"] === "mainnet" ? "mainnet" : "testnet",
    oracle: oracleMode(),
  });
});
