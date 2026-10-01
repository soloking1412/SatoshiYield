export interface BondObservation {
  network: "mainnet" | "testnet"; bitcoinNetwork: string; address: string; bondIndex: number;
  amountSats: bigint; allowance: bigint; requiredUstx: bigint | null; bond: unknown | null;
  status: string; reasons: string[]; preflightPassed: boolean; fundingAllowed: false;
  observedAt: number; expiresAt: number; tip: string; limitations: string[];
}
export function createPox5Client(options?: { network?: "mainnet" | "testnet"; fetch?: typeof fetch; now?: () => number }): {
  observe(input: { address: string; amountSats: bigint; bondIndex?: number; signerManager?: string }): Promise<BondObservation>;
};
