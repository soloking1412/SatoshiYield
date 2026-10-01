import { useQuery } from "@tanstack/react-query";
import { standardPrincipalCV } from "@stacks/transactions";
import { CONTRACTS } from "../constants/contracts.js";
import { useWallet } from "../context/WalletContext.js";
import { readContract, requireUint } from "../lib/chainRead.js";
import { networkName } from "../lib/stacksClient.js";
export function useBalance() {
  const { address } = useWallet();
  return useQuery({
    queryKey: ["balance", address, networkName, CONTRACTS.SBTC_TOKEN], enabled: !!address, refetchInterval: 20_000,
    queryFn: async () => {
      if (!address) throw new Error("Wallet not connected");
      return requireUint(await readContract(CONTRACTS.SBTC_TOKEN, "get-balance", [standardPrincipalCV(address)], address));
    },
  });
}
