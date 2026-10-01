import { useQuery } from "@tanstack/react-query";
import { CONTRACTS } from "../constants/contracts.js";
import { networkName } from "../lib/stacksClient.js";
import { readContract, requireUint, safeNumber } from "../lib/chainRead.js";
export interface VaultStats {
  totalDepositedSats: number; tvlCapSats: number; feeBasisPoints: number;
  feeBalanceSats: number; minDepositSats: number;
}
export async function fetchVaultStats(): Promise<VaultStats> {
  const functions = ["get-total-deposited", "get-tvl-cap", "get-fee-basis-points", "get-fee-balance", "get-min-deposit"];
  const [totalDepositedSats, tvlCapSats, feeBasisPoints, feeBalanceSats, minDepositSats] = await Promise.all(
    functions.map(async (fn) => safeNumber(requireUint(await readContract(CONTRACTS.VAULT, fn)))),
  );
  return { totalDepositedSats: totalDepositedSats!, tvlCapSats: tvlCapSats!, feeBasisPoints: feeBasisPoints!, feeBalanceSats: feeBalanceSats!, minDepositSats: minDepositSats! };
}
export function useVaultStats() {
  return useQuery({ queryKey: ["vaultStats", networkName, CONTRACTS.VAULT], queryFn: fetchVaultStats, refetchInterval: 30_000, staleTime: 15_000 });
}
