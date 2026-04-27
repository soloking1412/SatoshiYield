import { useQuery } from "@tanstack/react-query";
import {
  cvToHex,
  hexToCV,
  cvToValue,
  standardPrincipalCV,
} from "@stacks/transactions";
import { stacksNetwork } from "../lib/stacksClient.js";
import { CONTRACTS } from "../constants/contracts.js";
import { useWallet } from "../context/WalletContext.js";
import type { UserPosition } from "../types/position.js";
import type { ProtocolId } from "../types/yield.js";

const ADAPTER_BY_PRINCIPAL: Record<string, ProtocolId> = Object.fromEntries(
  Object.entries(CONTRACTS.ADAPTERS).map(([k, v]) => [v, k as ProtocolId])
);

async function readVaultPosition(
  vaultAddress: string,
  vaultName: string,
  senderAddress: string
): Promise<UserPosition | null> {
  const baseUrl = stacksNetwork.client.baseUrl;
  const url = `${baseUrl}/v2/contracts/call-read/${vaultAddress}/${vaultName}/get-position`;

  const body = {
    sender: senderAddress,
    arguments: [cvToHex(standardPrincipalCV(senderAddress))],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Stacks API error ${res.status}`);

  const json = (await res.json()) as { okay: boolean; result: string };
  if (!json.okay) return null;

  const cv = hexToCV(json.result);

  // cvToValue on someCV(tupleCV) returns the tuple fields directly (some is unwrapped).
  // cvToValue on noneCV returns null.
  // Each field comes back as { type: string; value: string } from cvToValue.
  type FieldVal = { type: string; value: string };
  const val = cvToValue(cv) as null | {
    value: {
      adapter: FieldVal;
      "principal-amount": FieldVal;
      "deposited-at": FieldVal;
    };
  };

  if (!val || !val.value?.adapter) return null;

  const adapterPrincipal = val.value.adapter.value;
  const protocol = ADAPTER_BY_PRINCIPAL[adapterPrincipal] ?? "bitflow";

  return {
    adapter: adapterPrincipal,
    protocol,
    principalSats: BigInt(val.value["principal-amount"].value),
    depositedAt: Number(val.value["deposited-at"].value),
  };
}

export function usePositions() {
  const { address } = useWallet();
  const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");

  return useQuery({
    queryKey: ["position", address],
    enabled: address !== null && !!vaultAddr && !!vaultName,
    queryFn: (): Promise<UserPosition | null> => {
      if (!address || !vaultAddr || !vaultName) return Promise.resolve(null);
      return readVaultPosition(vaultAddr, vaultName, address);
    },
  });
}
