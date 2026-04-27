import { useState } from "react";
import type { UserPosition } from "../../types/position.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useWithdraw } from "../../hooks/useWithdraw.js";
import { RebalanceModal } from "../rebalance/RebalanceModal.js";

function formatSats(sats: bigint): string {
  return `${(Number(sats) / 1e8).toFixed(6)} sBTC`;
}

export function PositionCard({ position }: { position: UserPosition }) {
  const meta = PROTOCOLS[position.protocol];
  const withdraw = useWithdraw();
  const [rebalanceOpen, setRebalanceOpen] = useState(false);

  return (
    <>
      <div className="bg-surface-card rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: meta.color }}
            >
              {meta.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-text-primary">{meta.name}</p>
              <p className="text-xs text-text-secondary">Active position</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-lg font-bold text-text-primary font-mono">
              {formatSats(position.principalSats)}
            </p>
            <p className="text-xs text-text-secondary">Principal</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setRebalanceOpen(true)}
            className="flex-1 py-2.5 rounded-lg border border-brand-orange text-brand-orange text-sm font-medium hover:bg-brand-orange/10 transition-colors"
          >
            Rebalance
          </button>
          <button
            onClick={() =>
              withdraw.mutate({ protocol: position.protocol })
            }
            disabled={withdraw.isPending}
            className="flex-1 py-2.5 rounded-lg border border-surface-border text-text-secondary text-sm font-medium hover:text-text-primary hover:border-text-muted disabled:opacity-50 transition-colors"
          >
            {withdraw.isPending ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>

        {withdraw.isError && (
          <p className="text-xs text-risk-high">
            Withdrawal failed. Please try again.
          </p>
        )}
      </div>

      <RebalanceModal
        open={rebalanceOpen}
        onClose={() => setRebalanceOpen(false)}
        currentProtocol={position.protocol}
      />
    </>
  );
}
