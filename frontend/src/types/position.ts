import type { ProtocolId } from "./yield.js";

export type PositionStatus = "active" | "pending";

export interface UserPosition {
  adapter: string;
  protocol: ProtocolId | null;
  principalSats: bigint;
  depositedAt: number;
  isAsync: boolean;
  status: PositionStatus;
  claimId: number;
  feeBps?: number;
  creditedShares?: bigint;
}
