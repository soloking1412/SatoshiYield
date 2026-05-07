/**
 * Shared native protocol APY fetchers.
 *
 * Each function tries the protocol's public HTTP API first. If that call
 * fails (wrong URL, network error, unexpected shape), it falls back to
 * reading the current on-chain oracle value so the oracle scheduler always
 * has something to push — demonstrating the push mechanism even before the
 * protocols expose stable public endpoints.
 *
 * Return value: decimal percentage (e.g. 0.22 = 22%) or null if both the
 * HTTP fetch AND the chain read both fail.
 *
 * Used by:
 *   - Individual fetchers for cross-source deviation checks.
 *   - oracle-pusher.ts to build the bps map before broadcasting set-apy txs.
 */

import { readUint } from "./chain.js";

const TIMEOUT_MS = 6_000;

export interface NativeApyResult {
  bitflow: number | null;
  alex:    number | null;
  zest:    number | null;
  velar:   number | null;
}

/** Fetch all four native APYs in parallel. Failures are isolated per protocol. */
export async function fetchNativeApys(): Promise<NativeApyResult> {
  const [bitflowResult, alexResult, zestResult, velarResult] =
    await Promise.allSettled([
      fetchBitflowNativeApy(),
      fetchAlexNativeApy(),
      fetchZestNativeApy(),
      fetchVelarNativeApy(),
    ]);

  return {
    bitflow: bitflowResult.status === "fulfilled" ? bitflowResult.value : null,
    alex:    alexResult.status    === "fulfilled" ? alexResult.value    : null,
    zest:    zestResult.status    === "fulfilled" ? zestResult.value    : null,
    velar:   velarResult.status   === "fulfilled" ? velarResult.value   : null,
  };
}

// ---------------------------------------------------------------------------
// Per-protocol fetchers — HTTP first, chain fallback
// ---------------------------------------------------------------------------

export async function fetchBitflowNativeApy(): Promise<number | null> {
  const http = await tryHttp("https://api.bitflow.finance/v1/pools/apy");
  if (http !== null) return http;
  // HTTP unavailable — fall back to on-chain value
  return chainApyPercent("bitflow-adapter-v2");
}

export async function fetchAlexNativeApy(): Promise<number | null> {
  // ALEX Lab public pools endpoint (v1 confirmed working)
  const http = await tryHttp("https://api.alexlab.co/v1/pool_stats/fwp-wstx-alex-50-50-v1-01");
  if (http !== null) return http;
  return chainApyPercent("alex-adapter-v2");
}

export async function fetchZestNativeApy(): Promise<number | null> {
  const http = await tryHttp("https://app.zestprotocol.com/api/apy");
  if (http !== null) return http;
  return chainApyPercent("zest-adapter-v2");
}

export async function fetchVelarNativeApy(): Promise<number | null> {
  const http = await tryHttp("https://api.velar.co/v1/pools");
  if (http !== null) return http;
  return chainApyPercent("velar-adapter-v2");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch `url`, extract a numeric `apy` field from the JSON body.
 * Returns null on any failure — never throws.
 */
async function tryHttp(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return extractApy(data);
  } catch {
    return null;
  }
}

/**
 * Read `get-apy` from an on-chain adapter contract and convert bps → decimal %.
 * e.g. 2200 bps → 22.0 → returned as 22.0 (the oracle-pusher multiplies by 100
 * to get bps again, so round-trips cleanly).
 *
 * Returns null if the chain read fails or returns 0 (uninitialized).
 */
async function chainApyPercent(adapterName: string): Promise<number | null> {
  try {
    const bps = await readUint(adapterName, "get-apy");
    if (bps === 0) return null;
    // bps → percent (e.g. 2200 → 22.0)
    // oracle-pusher does Math.round(value * 100) to get bps back
    // so we return bps / 100 here to keep the round-trip exact
    return bps / 100;
  } catch {
    return null;
  }
}

/** Extract `data.apy` as a finite non-negative number, or null. */
function extractApy(data: unknown): number | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "apy" in data &&
    typeof (data as Record<string, unknown>)["apy"] === "number"
  ) {
    const apy = (data as { apy: number }).apy;
    return Number.isFinite(apy) && apy >= 0 ? apy : null;
  }
  return null;
}
