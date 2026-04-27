import { YieldTable } from "../components/yields/YieldTable.js";

export function Dashboard() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Live Yields</h1>
        <p className="mt-1 text-text-secondary text-sm">
          sBTC yield rates across Stacks DeFi protocols, updated every 5
          minutes. Connect your wallet to deposit.
        </p>
      </div>

      <YieldTable />
    </main>
  );
}
