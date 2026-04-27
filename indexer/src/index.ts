import express from "express";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { yieldsRouter } from "./routes/yields.js";
import { healthRouter } from "./routes/health.js";

const app = express();

app.use(express.json());

// Trust the first proxy hop so req.ip reflects the real client IP behind
// reverse proxies (Railway/Render/Fly/Vercel etc.).
app.set("trust proxy", 1);

/**
 * CORS: allowed origins are configured via the CORS_ALLOWED_ORIGINS env var,
 * as a comma-separated list (e.g.
 *   "https://satoshi-yield.vercel.app,https://satoshi-yield-beta.vercel.app").
 *
 * If unset, defaults to localhost dev ports only. Never use "*" in prod.
 */
const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
];
const configured = (process.env["CORS_ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const ALLOWED_ORIGINS = new Set(configured.length > 0 ? configured : defaultOrigins);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// --- Simple in-memory rate limiter: 60 req / minute per IP ---
const hits = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
  }
  next();
});

app.use("/api/yields", yieldsRouter);
app.use("/api/health", healthRouter);

// --- Global error handler: never leak stack traces ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[indexer] unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`indexer running on :${config.port}`);
  console.log(`allowed CORS origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
});

export default app;
