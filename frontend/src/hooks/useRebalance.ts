import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { CONTRACTS } from "../constants/contracts.js";
import type { ProtocolId } from "../types/yield.js";

export function useRebalance() {
  const { callContract, address } = useWallet();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      from,
      to,
    }: {
      from: ProtocolId;
      to: ProtocolId;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const fromContract = CONTRACTS.ADAPTERS[from];
      const toContract = CONTRACTS.ADAPTERS[to];
      const [fromAddr, fromName] = fromContract.split(".");
      const [toAddr, toName] = toContract.split(".");
      const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName: "rebalance",
        functionArgs: [
          contractPrincipalCV(fromAddr!, fromName!),
          contractPrincipalCV(toAddr!, toName!),
        ],
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["position"] });
    },
  });
}
