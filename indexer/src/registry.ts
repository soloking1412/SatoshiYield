/**
 * Adapter Registry — the ONE file to update when adding a new yield adapter.
 *
 * Add one entry to ADAPTER_REGISTRY and everything else derives automatically:
 * ProtocolId type, aggregator fetches, oracle push targets, TVL, route validation.
 *
 * See docs/ADDING-AN-ADAPTER.md for the full checklist (contracts + frontend too).
 */

import { fetchZestNativeApy } from "./fetchers/native-apy.js";
// When enabling a new adapter, import its native-apy fetcher here:
// import { fetchHbtcNativeApy } from "./fetchers/native-apy.js";

export type RiskLevel = "low" | "medium" | "high";

export interface AdapterEntry {
  /** Default on-chain contract name. Overridable via process.env[envKey]. */
  defaultName: string;
  /** Env-var name for contract name override (e.g. "ZEST_ADAPTER_NAME"). */
  envKey: string;
  risk: RiskLevel;
  /** Bootstrap APY in bps — used until a live on-chain value is established. */
  referenceBps: number;
  /** True when a reliable live APY feed exists (drives is_live_integration). */
  hasLiveApy: boolean;
  /** DefiLlama protocol slug for TVL lookups. */
  defillamaSlug: string;
  /** Live native APY in percent, or null when no public feed exists. */
  fetchNativeApy: () => Promise<number | null>;
}

function defineRegistry<T extends Record<string, AdapterEntry>>(r: T): T {
  return r;
}

export const ADAPTER_REGISTRY = defineRegistry({
  zest: {
    defaultName: "zest-earn-adapter",
    envKey: "ZEST_ADAPTER_NAME",
    risk: "low" as RiskLevel,
    referenceBps: 350,
    hasLiveApy: true,
    defillamaSlug: "zest-v2",
    fetchNativeApy: fetchZestNativeApy,
  },

  // ── To enable Hermetica hBTC: uncomment + audit pass + SLA confirmed ─────
  // hbtc: {
  //   defaultName: "hermetica-hbtc-adapter",
  //   envKey: "HBTC_ADAPTER_NAME",
  //   risk: "medium" as RiskLevel,
  //   referenceBps: 800,
  //   hasLiveApy: false,
  //   defillamaSlug: "hermetica",
  //   fetchNativeApy: fetchHbtcNativeApy,
  // },

  // ── Template for future adapters ─────────────────────────────────────────
  // <id>: {
  //   defaultName: "<contract-name>",
  //   envKey: "<PROTOCOL>_ADAPTER_NAME",
  //   risk: "low" | "medium" | "high",
  //   referenceBps: <bootstrap APY × 100>,
  //   hasLiveApy: <true if a live feed is wired below>,
  //   defillamaSlug: "<defillama-slug>",
  //   fetchNativeApy: fetch<Protocol>NativeApy,
  // },
});

/** Union of all registered protocol ids (auto-derived — never edit manually). */
export type ProtocolId = keyof typeof ADAPTER_REGISTRY;

/** Resolved on-chain contract name for a protocol (respects env override). */
export function adapterName(protocol: ProtocolId): string {
  const entry = ADAPTER_REGISTRY[protocol];
  return (process.env[entry.envKey] as string | undefined) ?? entry.defaultName;
}
