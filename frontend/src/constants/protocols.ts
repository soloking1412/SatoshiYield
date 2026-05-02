import type { ProtocolId } from "../types/yield.js";

export interface ProtocolMeta {
  id: ProtocolId;
  abbr: string;
  name: string;
  color: string;
}

export const PROTOCOLS: Record<ProtocolId, ProtocolMeta> = {
  bitflow: { id: "bitflow", abbr: "BI", name: "Bitflow",  color: "oklch(64% .19 278)" },
  alex:    { id: "alex",    abbr: "AL", name: "ALEX Lab", color: "oklch(68% .19 52)"  },
  zest:    { id: "zest",    abbr: "ZE", name: "Zest",     color: "oklch(64% .19 150)" },
  velar:   { id: "velar",   abbr: "VE", name: "Velar",    color: "oklch(64% .19 340)" },
};
