import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pc, uintCV, contractPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { CONTRACTS } from "../constants/contracts.js";
import { PROTOCOLS } from "../constants/protocols.js";
import type { ProtocolId } from "../types/yield.js";

// Mainnet sBTC fungible-token name — SM3K…sbtc-token's `define-fungible-token`
// identifier is literally "sbtc-token", not "sbtc" (that's just the contract
// name / SIP-010 display name). Post-conditions are scoped to this exact
// (contract, asset-name) pair, so getting this wrong silently makes the
// post-condition watch an asset that never moves, aborting every deposit.
const SBTC_ASSET_NAME = "sbtc-token";

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
      const [sbtcAddr, sbtcName] = CONTRACTS.SBTC_TOKEN.split(".");

      // Deny mode requires every sbtc-token transfer in the tx to be covered,
      // not just the origin's. The deposit moves sBTC twice — user -> adapter,
      // then adapter -> the underlying vault (Zest/hBTC) — both for the same
      // amount, so both legs need their own post-condition.
      const userLeg = Pc.principal(address)
        .willSendEq(amountSats)
        .ft(CONTRACTS.SBTC_TOKEN as `${string}.${string}`, SBTC_ASSET_NAME);
      const adapterLeg = Pc.principal(adapterContract as `${string}.${string}`)
        .willSendEq(amountSats)
        .ft(CONTRACTS.SBTC_TOKEN as `${string}.${string}`, SBTC_ASSET_NAME);

      // Async adapters (hBTC) use the vault's deposit-async entrypoint; sync
      // adapters (Zest) use the atomic deposit.
      const functionName = PROTOCOLS[protocol].async ? "deposit-async" : "deposit";

      return callContract({
        contractAddress: vaultAddr!,
        contractName: vaultName!,
        functionName,
        functionArgs: [
          contractPrincipalCV(sbtcAddr!, sbtcName!),
          contractPrincipalCV(adapterAddr!, adapterName!),
          uintCV(amountSats),
        ],
        postConditions: [userLeg, adapterLeg],
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
