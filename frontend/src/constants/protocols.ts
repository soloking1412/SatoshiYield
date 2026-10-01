export type YieldKind = "lending" | "strategy";
export type ProtocolStatus = "review-required";
export interface ProtocolMeta {
  id: string; abbr: string; name: string; color: string; kind: YieldKind;
  principalProtected: boolean; async: boolean; status: ProtocolStatus;
  blurb: string; asset: string; withdrawal: string; website: string;
}
// Listing a strategy never authorizes it to receive deposits.
export const PROTOCOLS = {
  zest: {
    id: "zest", abbr: "ZE", name: "Zest", color: "#80b49a", kind: "lending",
    principalProtected: false, async: false, status: "review-required",
    asset: "sBTC", withdrawal: "Subject to available liquidity",
    website: "https://docs.zestprotocol.com/",
    blurb: "Legacy Zest Earn vault route remains under review. Current Zest sBTC lending is available separately under Connect protocols after live verification. Smart-contract, liquidity and sBTC peg risks apply; principal can be lost.",
  },
  hbtc: {
    id: "hbtc", abbr: "hB", name: "Hermetica hBTC", color: "#d2aa7b", kind: "strategy",
    principalProtected: false, async: true, status: "review-required",
    asset: "sBTC", withdrawal: "Request, wait for funding, then claim",
    website: "https://docs.hermetica.fi/hbtc/how-it-works/flows",
    blurb: "Managed strategy using sBTC collateral and external yield sources. Exposed to strategy losses, leverage, counterparties and delayed redemptions. No fixed yield or withdrawal deadline is promised.",
  },
} satisfies Record<string, ProtocolMeta>;
export type ProtocolId = keyof typeof PROTOCOLS;
export interface ComingSoonMeta {
  abbr: string; name: string; color: string; blurb: string;
  asset: string; website: string; status: "research" | "direct" | "test-preparation" | "eligibility"; withdrawal: string;
}
export const COMING_SOON: ComingSoonMeta[] = [
  { abbr: "BB", name: "Babylon BTC staking", color: "#d0aa6e", asset: "BTC", status: "test-preparation", withdrawal: "Unbonding period; slashing conditions apply", website: "https://docs.babylonlabs.io/guides/support/faqs/", blurb: "Signet wallet and parameter checks can prepare an unsigned staking plan. Signing and broadcast are unavailable. Finality-provider, slashing and unbonding risks apply." },
  { abbr: "LB", name: "Lombard LBTC", color: "#99bca7", asset: "BTC / LBTC", status: "test-preparation", withdrawal: "Custodian redemption and destination-chain rules", website: "https://docs.lombard.finance/use/faq", blurb: "Signet-to-Sepolia quotes and reviewed deposit-address authorization are available. No Bitcoin payment is submitted here. Custody, strategy, bridge and redemption risks apply." },
  { abbr: "SV", name: "SolvBTC", color: "#b7a280", asset: "BTC / SolvBTC", status: "research", withdrawal: "Custody and product-specific redemption", website: "https://docs.solv.finance/solvbtc-technical-architecture/bitcoin-mainnet-architecture", blurb: "Bitcoin custody and mapped tokens across other chains. Different products carry different yield and redemption risks. Wallet, bridge and custody integrations are not implemented here." },
  { abbr: "stB", name: "Stacking DAO stBTC", color: "#b4afa0", asset: "sBTC", status: "direct", withdrawal: "sBTC redemption subject to reserves and bonds", website: "https://docs.stackingdao.com/stackingdao", blurb: "Direct-wallet deposits, liquid withdrawals and existing NFT claims use live source and permission checks. New queued exits await guard deployment. Governance can modify existing claim records." },
  { abbr: "zv", name: "Zest zvstBTC", color: "#80b49a", asset: "sBTC", status: "research", withdrawal: "Vault liquidity and leverage constraints", website: "https://docs.zestprotocol.com/stacks-vaults/contracts", blurb: "A distinct stBTC strategy with operator-managed leverage. Not the legacy Zest Earn adapter. No deposit integration is enabled here." },
  { abbr: "STX", name: "STX stacking", color: "#a99cce", asset: "STX", status: "research", withdrawal: "Product-specific cycle and redemption rules", website: "https://docs.stackingdao.com/stackingdao", blurb: "stSTX and stSTXbtc accept STX. They require a separate STX asset flow and cannot be substituted for an sBTC deposit." },
  { abbr: "BTC", name: "Native BTC staking", color: "#d69862", asset: "BTC + STX", status: "eligibility", withdrawal: "Bitcoin timelock; bond-specific eligibility", website: "https://www.stacks.co/bitcoin-staking", blurb: "Read next-bond eligibility, wallet allowance and the paired STX commitment using the current PoX-5 API. Funding and registration signing are disabled. Testnet uses Bitcoin regtest, not Signet." },
];
