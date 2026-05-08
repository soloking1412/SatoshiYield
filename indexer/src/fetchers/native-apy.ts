const TIMEOUT_MS = 6_000;

export interface NativeApyResult {
  bitflow: number | null;
  alex:    number | null;
  zest:    number | null;
  velar:   number | null;
}

export async function fetchNativeApys(): Promise<NativeApyResult> {
  const [b, a, z, v] = await Promise.allSettled([
    fetchBitflowNativeApy(),
    fetchAlexNativeApy(),
    fetchZestNativeApy(),
    fetchVelarNativeApy(),
  ]);
  return {
    bitflow: b.status === "fulfilled" ? b.value : null,
    alex:    a.status === "fulfilled" ? a.value : null,
    zest:    z.status === "fulfilled" ? z.value : null,
    velar:   v.status === "fulfilled" ? v.value : null,
  };
}

export async function fetchBitflowNativeApy(): Promise<number | null> {
  return tryHttp("https://api.bitflow.finance/v1/pools/apy");
}

export async function fetchAlexNativeApy(): Promise<number | null> {
  return tryHttp("https://api.alexlab.co/v1/pool_stats/fwp-wstx-alex-50-50-v1-01");
}

export async function fetchZestNativeApy(): Promise<number | null> {
  return tryHttp("https://app.zestprotocol.com/api/apy");
}

export async function fetchVelarNativeApy(): Promise<number | null> {
  return tryHttp("https://api.velar.co/v1/pools");
}

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
