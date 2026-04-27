import type { ProtocolId } from "./yield.js";

export interface UserPosition {
  adapter: string;
  protocol: ProtocolId;
  principalSats: bigint;
  depositedAt: number;
}
