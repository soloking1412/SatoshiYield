import { Router } from "express";
import type { Request, Response } from "express";
import { isCached } from "../aggregator.js";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", cached: isCached() });
});
