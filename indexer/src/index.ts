import express from "express";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { yieldsRouter } from "./routes/yields.js";
import { healthRouter } from "./routes/health.js";
import { faucetRouter } from "./routes/faucet.js";
import { startOracleScheduler } from "./oracle-pusher.js";

/**
 * Validate environment at startup: print the network banner, warn on missing
 * oracle keys, and hard-fail a mainnet boot that is missing required config.
 */
function validateConfig(): void {
  const network = process.env["STACKS_NETWORK"] ?? "testnet";
  if (network !== "mainnet" && network !== "testnet") {
    throw new Error(
      `Invalid STACKS_NETWORK "${network}" — must be "mainnet" or "testnet".`
    );
  }
  const isMainnet = network === "mainnet";
  console.log(`[indexer] network: ${isMainnet ? "MAINNET" : "TESTNET"}`);

  const oracleKey = process.env["ORACLE_PRIVATE_KEY"];
  const oracleKey2 = process.env["ORACLE_PRIVATE_KEY_2"];
  if (!oracleKey) {
    console.warn(
      "[indexer] ORACLE_PRIVATE_KEY not set — oracle scheduler disabled, APY will not refresh."
    );
  } else if (!oracleKey2) {
    console.warn(
      "[indexer] ORACLE_PRIVATE_KEY_2 not set — single-oracle mode. 2-of-3 consensus " +
        "cannot be reached: on-chain APY goes stale after 720 blocks and deposits get blocked."
    );
  }

  if (isMainnet) {
    const missing = (["DEPLOYER_ADDRESS", "STACKS_API_URL"] as const).filter(
      (k) => !process.env[k]
    );
    if (missing.length > 0) {
      throw new Error(`[indexer] mainnet requires env vars: ${missing.join(", ")}`);
    }
    if (!oracleKey || !oracleKey2) {
      throw new Error(
        "[indexer] mainnet requires ORACLE_PRIVATE_KEY and ORACLE_PRIVATE_KEY_2 for 2-of-3 oracle consensus."
      );
    }
  }
}

validateConfig();

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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

// Purge expired rate-limit buckets so the map can't grow unbounded over time.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now > entry.reset) hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

app.use("/api/yields", yieldsRouter);
app.use("/api/health", healthRouter);
app.use("/api/faucet", faucetRouter);

// --- Global error handler: never leak stack traces ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[indexer] unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(config.port, () => {
  console.log(`indexer running on :${config.port}`);
  console.log(`allowed CORS origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
});

// Graceful shutdown: drain in-flight requests on SIGTERM/SIGINT (Render/Railway
// send SIGTERM on redeploy) instead of dropping connections abruptly.
function shutdown(signal: string): void {
  console.log(`[indexer] ${signal} received — shutting down`);
  server.close(() => {
    console.log("[indexer] HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error(
    "[indexer] unhandled rejection:",
    reason instanceof Error ? reason.message : reason
  );
});

// Oracle scheduler: fetches live APY and pushes to chain every 30 min — well
// inside the adapters' ~5.5h (2160-block) staleness window, so on-chain APY
// never goes stale (and deposits never block) while the indexer is running.
// No-ops silently if ORACLE_PRIVATE_KEY is not set.
startOracleScheduler(30 * 60 * 1000);

export default app;
