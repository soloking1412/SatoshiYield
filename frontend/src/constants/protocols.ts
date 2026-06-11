import type { ProtocolId } from "../types/yield.js";

export type YieldKind = "lending" | "strategy";

// "live-yield" — adapter routes funds into the real protocol; users earn now.
export type ProtocolStatus = "live-yield";

export interface ProtocolMeta {
  id: ProtocolId;
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

export const PROTOCOLS: Record<ProtocolId, ProtocolMeta> = {
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
  hbtc: {
    id: "hbtc",
    abbr: "hB",
    name: "Hermetica hBTC",
    color: "oklch(70% .17 55)",
    kind: "strategy",
    principalProtected: false,
    async: true,
    status: "live-yield",
    blurb:
      "Managed Bitcoin yield vault (~8% target). NOT principal-guaranteed: a small exit fee may apply and withdrawals are processed in two steps — you request a redemption, Hermetica funds it after a cooldown of about 3 days, then you claim. You can cancel an unfunded request any time (unless the vault has been blacklisted). Deposits are subject to Hermetica's vault capacity.",
  },
};

// Static "more yields coming soon" tiles — not driven by the indexer. The next
// integration is native Dual Stacking (PoX).
export interface ComingSoonMeta {
  abbr: string;
  name: string;
  color: string;
  blurb: string;
}

export const COMING_SOON: ComingSoonMeta[] = [
  {
    abbr: "DS",
    name: "Dual Stacking (PoX)",
    color: "oklch(62% .19 260)",
    blurb:
      "Native Bitcoin staking yield via Stacks Proof-of-Transfer. Principal-protected — integration in progress.",
  },
];
