import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pc, uintCV, contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { CONTRACTS } from "../constants/contracts.js";
import type { ProtocolId } from "../types/yield.js";

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";
const SBTC_ASSET_NAME = isMainnet ? "sbtc" : "mock-sbtc";

export function useDeposit() {
  const { callContract, address } = useWallet();
  const { show } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      protocol,
      amountSats,
    }: {
      protocol: ProtocolId;
      amountSats: bigint;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const adapterContract = CONTRACTS.ADAPTERS[protocol];
      const [adapterAddr, adapterName] = adapterContract.split(".");
      const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");

      const postCondition = Pc.principal(address)
        .willSendEq(amountSats)
        .ft(CONTRACTS.SBTC_TOKEN as `${string}.${string}`, SBTC_ASSET_NAME);

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName: "deposit",
        functionArgs: [
          contractPrincipalCV(adapterAddr!, adapterName!),
          uintCV(amountSats),
        ],
        postConditions: [postCondition],
      });
    },
    onSuccess: (txid) => {
      show({ variant: "success", message: "Deposit sent! Confirming on-chain…", txid });
      void qc.invalidateQueries({ queryKey: ["position", address] });
      void qc.invalidateQueries({ queryKey: ["balance", address] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Deposit failed. Please try again.";
      show({ variant: "error", message: msg });
    },
  });
}
