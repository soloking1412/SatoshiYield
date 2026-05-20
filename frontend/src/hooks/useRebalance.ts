import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { CONTRACTS } from "../constants/contracts.js";
import type { ProtocolId } from "../types/yield.js";

export function useRebalance() {
  const { callContract, address } = useWallet();
  const { show } = useToast();
  const qc = useQueryClient();

  return useMutation({
    // `fromAdapter` is the position's on-chain adapter principal ("ADDR.name");
    // `to` is the target protocol the user picked.
    mutationFn: async ({
      fromAdapter,
      to,
    }: {
      fromAdapter: string;
      to: ProtocolId;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const [fromAddr, fromName] = fromAdapter.split(".");
      const [toAddr, toName] = CONTRACTS.ADAPTERS[to].split(".");
      const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");
      const [sbtcAddr, sbtcName] = CONTRACTS.SBTC_TOKEN.split(".");
      if (!fromAddr || !fromName) {
        throw new Error("Position has an invalid adapter — cannot rebalance");
      }

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName: "rebalance",
        functionArgs: [
          contractPrincipalCV(sbtcAddr!, sbtcName!),
          contractPrincipalCV(fromAddr, fromName),
          contractPrincipalCV(toAddr!, toName!),
        ],
      });
    },
    onSuccess: (txid) => {
      show({
        variant: "success",
        message: "Rebalance sent! Position moving to new protocol…",
        txid,
      });
      void qc.invalidateQueries({ queryKey: ["position"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Rebalance failed. Please try again.";
      show({ variant: "error", message: msg });
    },
  });
}
