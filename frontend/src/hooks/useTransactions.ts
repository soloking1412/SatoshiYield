import { useSyncExternalStore } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWallet } from "../context/WalletContext.js";
import { networkName } from "../lib/stacksClient.js";
import {
  getSubmittedCalls,
  subscribeTransactions,
  fetchTransactionReceipt,
} from "../lib/transactionJournal.js";

export function useTransactions() {
  const { address } = useWallet();
  const client = useQueryClient();
  const history = useSyncExternalStore(
    subscribeTransactions,
    getSubmittedCalls,
    getSubmittedCalls,
  );
  const calls = history
    .filter((call) => call.sender === address && call.network === networkName)
    .slice(0, 20);
  const results = useQueries({
    queries: calls.map((call) => ({
      queryKey: ["transaction-receipt", call.network, call.sender, call.txid],
      queryFn: () => fetchTransactionReceipt(call),
      staleTime: 10_000,
      refetchInterval: 30_000,
      retry: false,
    })),
  });
  const observationKey = results
    .map((result, i) => `${calls[i]?.txid}:${result.data?.state}`)
    .join("|");
  useEffect(() => {
    if (!address) return;
    // Both success and a later reorg/error must refresh the actual balance/position.
    void client.invalidateQueries({ queryKey: ["position", address] });
    void client.invalidateQueries({ queryKey: ["balance", address] });
    void client.invalidateQueries({ queryKey: ["direct-holdings", address] });
    void client.invalidateQueries({ queryKey: ["vaultStats"] });
  }, [address, client, observationKey]);
  return calls.map((call, index) => ({
    call,
    receipt: results[index]?.data,
    isLoading: results[index]?.isLoading ?? false,
    refresh: results[index]!.refetch,
  }));
}
