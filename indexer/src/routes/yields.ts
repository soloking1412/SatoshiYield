import { Router } from "express";
import type { Request, Response } from "express";
import { aggregateYields } from "../aggregator.js";
import type { ProtocolId } from "../types.js";

const VALID_PROTOCOLS = new Set<string>(["bitflow", "alex", "zest", "velar"]);

export const yieldsRouter = Router();

yieldsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await aggregateYields();
    res.json(data);
  } catch (err) {
    console.error("[yields] aggregation failed:", (err as Error).message);
    res.status(503).json({ error: "Yield data temporarily unavailable" });
  }
});

yieldsRouter.get("/:protocol", async (req: Request, res: Response) => {
  const rawParam = req.params["protocol"];
  const protocol = typeof rawParam === "string" ? rawParam : "";

  if (!VALID_PROTOCOLS.has(protocol)) {
    res.status(404).json({ error: "Unknown protocol" });
    return;
  }

  try {
    const data = await aggregateYields();
    const entry = data.find((y) => y.protocol === (protocol as ProtocolId));

    if (!entry) {
      res.status(503).json({ error: "Protocol data unavailable" });
      return;
    }

    res.json(entry);
  } catch (err) {
    console.error("[yields] aggregation failed:", (err as Error).message);
    res.status(503).json({ error: "Yield data temporarily unavailable" });
  }
});
