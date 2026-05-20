import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { CONTRACTS } from "../constants/contracts.js";

export function useWithdraw() {
  const { callContract, address } = useWallet();
  const { show } = useToast();
  const qc = useQueryClient();

  return useMutation({
    // `adapter` is the position's on-chain adapter principal ("ADDR.name").
    // Targeting it directly keeps withdraw correct even when the protocol
    // label could not be resolved from the known-adapter table.
    mutationFn: async ({ adapter }: { adapter: string }) => {
      if (!address) throw new Error("Wallet not connected");

      const [adapterAddr, adapterName] = adapter.split(".");
      const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");
      const [sbtcAddr, sbtcName] = CONTRACTS.SBTC_TOKEN.split(".");
      if (!adapterAddr || !adapterName) {
        throw new Error("Position has an invalid adapter — cannot withdraw");
      }

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName: "withdraw",
        functionArgs: [
          contractPrincipalCV(sbtcAddr!, sbtcName!),
          contractPrincipalCV(adapterAddr, adapterName),
        ],
      });
    },
    onSuccess: (txid) => {
      show({ variant: "success", message: "Withdrawal sent! Funds returning to your wallet…", txid });
      void qc.refetchQueries({ queryKey: ["position", address] });
      void qc.invalidateQueries({ queryKey: ["balance", address] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Withdrawal failed. Please try again.";
      show({ variant: "error", message: msg });
    },
  });
}
