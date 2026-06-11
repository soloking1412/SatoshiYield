import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { CONTRACTS } from "../constants/contracts.js";

/**
 * Two-phase async withdrawal for hBTC-style adapters:
 *   request-withdraw -> (Hermetica funds the claim) -> claim-withdraw
 * with cancel-withdraw as an escape hatch while the claim is unfunded.
 *
 * All three target the position's on-chain adapter principal directly so they
 * stay correct even if the protocol label could not be resolved.
 */

function useAsyncMutation(
  functionName: "request-withdraw" | "claim-withdraw" | "cancel-withdraw",
  successMessage: string,
  withSbtc: boolean
) {
  const { callContract, address } = useWallet();
  const { show } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ adapter }: { adapter: string }) => {
      if (!address) throw new Error("Wallet not connected");
      const [adapterAddr, adapterName] = adapter.split(".");
      const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");
      const [sbtcAddr, sbtcName] = CONTRACTS.SBTC_TOKEN.split(".");
      if (!adapterAddr || !adapterName) {
        throw new Error("Position has an invalid adapter");
      }
      // request/cancel take just the adapter; claim also takes the sBTC token.
      const functionArgs = withSbtc
        ? [contractPrincipalCV(sbtcAddr!, sbtcName!), contractPrincipalCV(adapterAddr, adapterName)]
        : [contractPrincipalCV(adapterAddr, adapterName)];

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName,
        functionArgs,
      });
    },
    onSuccess: (txid) => {
      show({ variant: "success", message: successMessage, txid });
      void qc.refetchQueries({ queryKey: ["position", address] });
      void qc.invalidateQueries({ queryKey: ["balance", address] });
    },
    onError: (err: unknown) => {
      show({
        variant: "error",
        message: err instanceof Error ? err.message : "Action failed. Please try again.",
      });
    },
  });
}

export const useRequestWithdraw = () =>
  useAsyncMutation("request-withdraw", "Withdrawal requested — Hermetica will fund it shortly.", false);

export const useClaimWithdraw = () =>
  useAsyncMutation("claim-withdraw", "Claim sent! Funds returning to your wallet…", true);

export const useCancelWithdraw = () =>
  useAsyncMutation("cancel-withdraw", "Withdrawal cancelled — your position is active again.", false);
