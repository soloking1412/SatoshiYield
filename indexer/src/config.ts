const port = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3001;
const cacheSeconds = process.env["CACHE_TTL_SECONDS"]
  ? parseInt(process.env["CACHE_TTL_SECONDS"], 10)
  : 300;

export const config = {
  port,
  cacheSeconds,
  fetchTimeoutMs: 8_000,
} as const;
