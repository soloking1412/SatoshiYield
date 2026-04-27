import type { ProtocolId } from "../types/yield.js";

export interface ProtocolMeta {
  id: ProtocolId;
  name: string;
  color: string;
}

export const PROTOCOLS: Record<ProtocolId, ProtocolMeta> = {
  bitflow: { id: "bitflow", name: "Bitflow", color: "#6366F1" },
  alex: { id: "alex", name: "ALEX Lab", color: "#F59E0B" },
  zest: { id: "zest", name: "Zest", color: "#22C55E" },
  velar: { id: "velar", name: "Velar", color: "#EC4899" },
};
