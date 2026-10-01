import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ProtocolId } from "../../../../integrations/stacks/src/index.mjs";
import { useWallet } from "../../context/WalletContext.js";
import { networkName } from "../../lib/stacksClient.js";
import { formatSbtcAmount } from "../../lib/amount.js";
import { Icon } from "../shared/Icon.js";

export function ProtocolHoldings() {
  const { address } = useWallet();
  const holdings = useQuery({
    queryKey: ["direct-holdings", address, networkName], enabled: false, staleTime: 60_000, retry: false,
    queryFn: async () => {
      if (!address || networkName !== "mainnet") throw new Error("A Stacks mainnet wallet is required.");
      const { createStacksIntegrationClient } = await import("../../../../integrations/stacks/src/index.mjs");
      const client = createStacksIntegrationClient();
      const result: Array<{ protocol: ProtocolId; name: string; receipt: string; shares?: bigint; estimate?: bigint; error?: string }> = [];
      for (const [protocol, name, receipt] of [["zest-sbtc", "Zest", "zsBTC"], ["stackingdao-stbtc", "StackingDAO", "stBTC"]] as const) {
        const item: typeof result[number] = { protocol, name, receipt };
        try {
          const state = await client.readState(protocol, address); item.shares = state.receiptBalance;
          if (state.receiptBalance > 0n) {
            try { item.estimate = (await client.quote(state, "redeem", state.receiptBalance)).expectedOut; }
            catch (e) { item.error = e instanceof Error ? e.message : "Current redemption could not be quoted."; }
          }
        } catch (e) { item.error = e instanceof Error ? e.message : "Protocol holdings could not be verified."; }
        result.push(item);
      }
      return result;
    },
  });
  return <section className="protocol-holdings" aria-labelledby="holdings-heading"><div className="section-heading"><div><h2 id="holdings-heading">Direct protocol holdings</h2><p>Wallet receipts outside the SatoshiYield vault. Redemption estimates are not cost basis or profit.</p></div><button className="btn ghost" disabled={holdings.isFetching || !address || networkName !== "mainnet"} onClick={() => void holdings.refetch()}>{holdings.isFetching ? "Reading holdings…" : holdings.data ? "Refresh holdings" : "Load protocol holdings"}</button></div>
    {networkName !== "mainnet" ? <p className="activity-empty">Current Zest and StackingDAO deployments are mainnet routes. They are not queried using this testnet wallet.</p> : holdings.isFetching ? <p className="activity-empty" role="status">Checking protocol source hashes, wallet receipts and available redemption liquidity.</p> : holdings.isError ? <div className="notice error" role="alert"><Icon name="info" /><div>Holdings could not be verified. A failed read does not mean your balance is zero.</div></div> : holdings.data ? <div className="holdings-list">{holdings.data.map(item => <article className="holding-row" key={item.protocol}><div><h3>{item.name}</h3><span className="text-muted small">{item.receipt} wallet receipt</span></div><div><strong className="mono">{item.shares === undefined ? "Unavailable" : `${formatSbtcAmount(item.shares)} ${item.receipt}`}</strong><p>{item.estimate !== undefined ? `Exit estimate at last check: ${formatSbtcAmount(item.estimate)} sBTC` : item.shares === 0n ? "No receipt tokens in this wallet" : "Redemption estimate unavailable"}</p>{item.error && <p className="holding-error">{item.error}</p>}</div><Link className="text-link" to={`/integrations?protocol=${item.protocol}&action=redeem`}>Review withdrawal <Icon name="arrow" size={13} /></Link></article>)}</div> : <p className="activity-empty">Load balances when you need them. This screen does not continuously poll external protocols.</p>}
    <p className="route-note">{holdings.dataUpdatedAt > 0 && <>Last checked {new Date(holdings.dataUpdatedAt).toLocaleString()}. Every wallet action rechecks the protocol.</>} Queued StackingDAO withdrawals hold an NFT instead of a receipt balance. <Link className="text-link" to="/integrations?protocol=stackingdao-stbtc&action=claim">Check an NFT by its ID</Link>. NFT holdings are not automatically enumerated here.</p>
  </section>;
}
