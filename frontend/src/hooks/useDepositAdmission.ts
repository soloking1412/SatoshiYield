import { useQuery } from "@tanstack/react-query";
import { CONTRACTS, DEPOSITS_ENABLED } from "../constants/contracts.js";
import type { ProtocolId } from "../constants/protocols.js";
import { networkName } from "../lib/stacksClient.js";
import { fetchDepositAdmission } from "../lib/depositAdmission.js";

export function useDepositAdmission(protocol: ProtocolId) {
  return useQuery({
    queryKey: ["depositAdmission", networkName, CONTRACTS.VAULT, CONTRACTS.ADAPTERS[protocol]],
    queryFn: () => fetchDepositAdmission(protocol), enabled: DEPOSITS_ENABLED,
    refetchInterval: 15_000, staleTime: 5_000,
  });
}
