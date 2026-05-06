/**
 * Shared native protocol API fetchers.
 *
 * These functions call each protocol's own public API to retrieve the
 * current APY as a decimal percentage (e.g. 0.22 = 22%).
 *
 * Used by:
 *   - Individual fetchers (alex.ts, bitflow.ts, etc.) for cross-source
 *     deviation cross-checking against the on-chain oracle value.
 *   - oracle-pusher.ts to build the bps map before pushing set-apy txs.
 *
 * All functions return null on any failure — callers must handle gracefully.
 */

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

/** Fetch APY from Bitflow's native API. Returns decimal percent or null. */
export async function fetchBitflowNativeApy(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.bitflow.finance/v1/pools/apy",
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const apy = extractApy(data);
    return apy;
  } catch {
    return null;
  }
}

/** Fetch APY from ALEX Lab's native API. Returns decimal percent or null. */
export async function fetchAlexNativeApy(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.alexlab.co/v1/stats/apy",
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return extractApy(data);
  } catch {
    return null;
  }
}

/** Fetch APY from Zest Protocol's native API. Returns decimal percent or null. */
export async function fetchZestNativeApy(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://app.zestprotocol.com/api/apy",
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return extractApy(data);
  } catch {
    return null;
  }
}

/** Fetch APY from Velar's native API. Returns decimal percent or null. */
export async function fetchVelarNativeApy(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.velar.co/v1/pools/apy",
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return extractApy(data);
  } catch {
    return null;
  }
}

/** Extract `data.apy` as a number. Returns null if missing or wrong type. */
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
