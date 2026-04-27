import { useState } from "react";
import type { NormalizedYield } from "../../types/yield.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { RiskBadge } from "./RiskBadge.js";
import { useWallet } from "../../context/WalletContext.js";
import { useDeposit } from "../../hooks/useDeposit.js";

function formatTvl(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd}`;
}

function satsToBtc(sats: bigint): string {
  return (Number(sats) / 1e8).toFixed(6);
}

export function YieldRow({ data }: { data: NormalizedYield }) {
  const meta = PROTOCOLS[data.protocol];
  const { isConnected } = useWallet();
  const deposit = useDeposit();
  const [amountBtc, setAmountBtc] = useState("");
  const [showInput, setShowInput] = useState(false);

  function handleDeposit() {
    const parsed = parseFloat(amountBtc);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1.5) return; // max 1.5 sBTC = TVL cap
    const sats = BigInt(Math.round(parsed * 1e8));
    if (sats <= 0n) return;
    deposit.mutate(
      { protocol: data.protocol, amountSats: sats },
      {
        onSuccess: () => {
          setShowInput(false);
          setAmountBtc("");
        },
      }
    );
  }

  return (
    <div className="bg-surface-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 sm:w-40">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: meta.color }}
        >
          {meta.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="font-medium text-text-primary">{meta.name}</span>
      </div>

      <div className="flex items-center gap-6 flex-1">
        <div>
          <p className="text-xl font-bold text-yield-green">
            {data.apy_percent.toFixed(1)}%
          </p>
          <p className="text-xs text-text-secondary">APY</p>
        </div>

        <RiskBadge level={data.risk_level} />

        <div className="hidden md:block">
          <p className="text-sm text-text-primary">{formatTvl(data.tvl_usd)}</p>
          <p className="text-xs text-text-secondary">TVL</p>
        </div>

        <div className="hidden lg:block">
          <p className="text-sm text-text-primary">{data.reward_token}</p>
          <p className="text-xs text-text-secondary">Reward</p>
        </div>

        {data.lock_period_days > 0 && (
          <div className="hidden md:block">
            <p className="text-sm text-text-primary">{data.lock_period_days}d</p>
            <p className="text-xs text-text-secondary">Lock</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isConnected && showInput ? (
          <>
            <input
              type="number"
              placeholder="0.001"
              value={amountBtc}
              onChange={(e) => setAmountBtc(e.target.value)}
              className="w-28 px-3 py-2 rounded-lg bg-surface-base border border-surface-border text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-orange"
              min="0"
              step="0.001"
            />
            <button
              onClick={handleDeposit}
              disabled={deposit.isPending || !amountBtc}
              className="px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deposit.isPending ? "..." : "Deposit"}
            </button>
            <button
              onClick={() => setShowInput(false)}
              className="px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary text-sm transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => (isConnected ? setShowInput(true) : undefined)}
            disabled={!isConnected}
            className="px-5 py-2 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 min-w-[90px]"
          >
            Deposit
          </button>
        )}
      </div>
    </div>
  );
}
