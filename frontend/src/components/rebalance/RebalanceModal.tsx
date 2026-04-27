import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { ProtocolId } from "../../types/yield.js";
import { PROTOCOLS } from "../../constants/protocols.js";
import { useRebalance } from "../../hooks/useRebalance.js";
import { useYields } from "../../hooks/useYields.js";
import { clsx } from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
  currentProtocol: ProtocolId;
}

export function RebalanceModal({ open, onClose, currentProtocol }: Props) {
  const { data: yields } = useYields();
  const rebalance = useRebalance();
  const [selected, setSelected] = useState<ProtocolId | null>(null);

  const options = (yields ?? []).filter((y) => y.protocol !== currentProtocol);

  function handleConfirm() {
    if (!selected) return;
    rebalance.mutate(
      { from: currentProtocol, to: selected },
      { onSuccess: onClose }
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold text-text-primary mb-1">
            Rebalance Position
          </Dialog.Title>
          <Dialog.Description className="text-sm text-text-secondary mb-5">
            Move from{" "}
            <span className="text-text-primary font-medium">
              {PROTOCOLS[currentProtocol].name}
            </span>{" "}
            to a higher-yielding protocol.
          </Dialog.Description>

          <div className="space-y-2 mb-6">
            {options.map((y) => (
              <button
                key={y.protocol}
                onClick={() => setSelected(y.protocol)}
                className={clsx(
                  "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors",
                  selected === y.protocol
                    ? "border-brand-orange bg-brand-orange/10"
                    : "border-surface-border hover:border-text-muted"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: PROTOCOLS[y.protocol].color }}
                  >
                    {PROTOCOLS[y.protocol].name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-text-primary">
                    {PROTOCOLS[y.protocol].name}
                  </span>
                </div>
                <span className="text-sm font-bold text-yield-green">
                  {y.apy_percent.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-surface-border text-text-secondary text-sm hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected || rebalance.isPending}
              className="flex-1 py-2.5 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {rebalance.isPending ? "Moving..." : "Confirm"}
            </button>
          </div>

          {rebalance.isError && (
            <p className="mt-3 text-xs text-risk-high text-center">
              Transaction failed. Please try again.
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
