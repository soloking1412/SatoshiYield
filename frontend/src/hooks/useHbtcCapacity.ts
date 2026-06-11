import { useQuery } from "@tanstack/react-query";
import { cvToHex, hexToCV, cvToValue, uintCV } from "@stacks/transactions";
import { stacksNetwork, networkName } from "../lib/stacksClient.js";

/**
 * Reads the live Hermetica hBTC deposit capacity (state-hbtc-v1.get-deposit-state)
 * so the deposit UI can warn BEFORE a deposit reverts with the vault's
 * ERR_DEPOSIT_CAP_EXCEEDED (u103001). Mainnet-only — the hBTC contracts don't
 * exist on testnet, so we report "unlimited" headroom there.
 */

const STATE_ADDR = "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D";
const STATE_NAME = "state-hbtc-v1";

export interface HbtcCapacity {
  capSats: bigint;
  netAssetsSats: bigint;
  headroomSats: bigint; // remaining sBTC that can be deposited
}

async function fetchCapacity(): Promise<HbtcCapacity | null> {
  const baseUrl = stacksNetwork.client.baseUrl;
  const url = `${baseUrl}/v2/contracts/call-read/${STATE_ADDR}/${STATE_NAME}/get-deposit-state`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: STATE_ADDR, arguments: [cvToHex(uintCV(1))] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { okay: boolean; result: string };
  if (!json.okay) return null;

  const val = cvToValue(hexToCV(json.result)) as Record<string, { value: string }>;
  const cap = BigInt(val["deposit-cap"]?.value ?? "0");
  const net = BigInt(val["net-assets"]?.value ?? "0");
  return { capSats: cap, netAssetsSats: net, headroomSats: cap > net ? cap - net : 0n };
}

export function useHbtcCapacity(enabled: boolean) {
  return useQuery({
    queryKey: ["hbtc-capacity"],
    queryFn: fetchCapacity,
    enabled: enabled && networkName === "mainnet",
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });
}
