export type YieldKind = "lending" | "strategy";

// "live-yield" — adapter routes funds into the real protocol; users earn now.
export type ProtocolStatus = "live-yield";

export interface ProtocolMeta {
  id: string;
  abbr: string;
  name: string;
  color: string;
  kind: YieldKind;
  principalProtected: boolean;
  // Async => two-phase withdrawal (request -> protocol funds -> claim, with cancel).
  async: boolean;
  status: ProtocolStatus;
  // Shown in the deposit modal so users understand the yield + withdrawal model.
  blurb: string;
}

// Helper preserves specific key types (prevents ProtocolId circularity).
function defineProtocols<T extends Record<string, ProtocolMeta>>(p: T): T {
  return p;
}

/**
 * Live adapters — one entry here registers a protocol across the whole app.
 * ProtocolId is auto-derived; never edit it manually.
 *
 * To add an adapter: add one entry here.
 * To move to "coming soon": cut the entry from PROTOCOLS, paste into COMING_SOON.
 */
export const PROTOCOLS = defineProtocols({
  zest: {
    id: "zest",
    abbr: "ZE",
    name: "Zest",
    color: "oklch(64% .19 150)",
    kind: "lending",
    principalProtected: true,
    async: false,
    status: "live-yield",
    blurb:
      "Overcollateralized sBTC lending. Principal-protected, withdraw any time — you earn the supply interest and keep 95% of the yield.",
  },

  // ── To enable Hermetica hBTC: uncomment + audit pass + SLA confirmed ─────
  // hbtc: {
  //   id: "hbtc",
  //   abbr: "hB",
  //   name: "Hermetica hBTC",
  //   color: "oklch(70% .17 55)",
  //   kind: "strategy",
  //   principalProtected: false,
  //   async: true,
  //   status: "live-yield",
  //   blurb:
  //     "Managed Bitcoin yield vault (~8% target). NOT principal-guaranteed: a small exit fee may apply " +
  //     "and withdrawals are processed in two steps — request, Hermetica funds after ~3 days, then claim. " +
  //     "Cancel an unfunded request any time. Deposits subject to vault capacity.",
  // },
});

/** Auto-derived from PROTOCOLS — never edit manually, just add to PROTOCOLS. */
export type ProtocolId = keyof typeof PROTOCOLS;

// Static "more yields coming soon" tiles — not driven by the indexer.
export interface ComingSoonMeta {
  abbr: string;
  name: string;
  color: string;
  blurb: string;
}

export const COMING_SOON: ComingSoonMeta[] = [
  {
    abbr: "hB",
    name: "Hermetica hBTC",
    color: "oklch(70% .17 55)",
    blurb:
      "Managed Bitcoin yield vault (~8% target). Pending partner SLA confirmation and independent audit — launching soon.",
  },
  {
    abbr: "DS",
    name: "Dual Stacking (PoX)",
    color: "oklch(62% .19 260)",
    blurb:
      "Native Bitcoin staking yield via Stacks Proof-of-Transfer. Principal-protected — integration in progress.",
  },
];
