import { useQuery } from "@tanstack/react-query";
import { cvToHex, standardPrincipalCV } from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacksClient.js";
import { CONTRACTS } from "../constants/contracts.js";
import { useWallet } from "../context/WalletContext.js";

/** Fetch the connected wallet's sBTC balance in satoshis. */
export function useBalance() {
  const { address } = useWallet();
  const baseUrl = stacksNetwork.client.baseUrl;
  const [tokenAddr, tokenName] = CONTRACTS.SBTC_TOKEN.split(".");

  return useQuery({
    queryKey: ["balance", address],
    enabled: !!address && !!tokenAddr && !!tokenName,
    refetchInterval: 20_000,
    queryFn: async (): Promise<bigint> => {
      if (!address || !tokenAddr || !tokenName) return 0n;
      const url = `${baseUrl}/v2/contracts/call-read/${tokenAddr}/${tokenName}/get-balance`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: address,
          arguments: [cvToHex(standardPrincipalCV(address))],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await res.json()) as { okay: boolean; result: string };
      if (!json.okay) return 0n;
      const hex = json.result.startsWith("0x") ? json.result.slice(2) : json.result;
      // (ok uint) → 0701 + 32-char big-endian uint128
      if (hex.startsWith("0701")) return BigInt("0x" + hex.slice(4));
      return 0n;
    },
  });
}
