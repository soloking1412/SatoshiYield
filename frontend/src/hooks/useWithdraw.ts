import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { CONTRACTS } from "../constants/contracts.js";
import type { ProtocolId } from "../types/yield.js";

export function useWithdraw() {
  const { callContract, address } = useWallet();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ protocol }: { protocol: ProtocolId }) => {
      if (!address) throw new Error("Wallet not connected");

      const adapterContract = CONTRACTS.ADAPTERS[protocol];
      const [adapterAddr, adapterName] = adapterContract.split(".");
      const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName: "withdraw",
        functionArgs: [contractPrincipalCV(adapterAddr!, adapterName!)],
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["position"] });
    },
  });
}
