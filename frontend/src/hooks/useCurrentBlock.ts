import { useQuery } from "@tanstack/react-query";
import { stacksNetwork } from "../lib/stacksClient.js";

export function useCurrentBlock(): number {
  const baseUrl = stacksNetwork.client.baseUrl;
  const { data } = useQuery({
    queryKey: ["blockHeight"],
    queryFn: async (): Promise<number> => {
      const res  = await fetch(`${baseUrl}/v2/info`, { signal: AbortSignal.timeout(5_000) });
      const json = await res.json() as { stacks_tip_height: number };
      return json.stacks_tip_height;
    },
    refetchInterval: 120_000,
    staleTime:        60_000,
  });
  return data ?? 0;
}
