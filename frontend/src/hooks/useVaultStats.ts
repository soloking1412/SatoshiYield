import { useQuery } from "@tanstack/react-query";
import { stacksNetwork } from "../lib/stacksClient.js";
import { CONTRACTS } from "../constants/contracts.js";

export interface VaultStats {
  totalDepositedSats: number;   // vault-v6 get-total-deposited
  tvlCapSats: number;           // vault-v6 get-tvl-cap
  feeBasisPoints: number;       // vault-v6 get-fee-basis-points  (default 500 = 5%)
  feeBalanceSats: number;       // vault-v6 get-fee-balance
  minDepositSats: number;       // vault-v6 get-min-deposit (constant 1000)
}

/**
 * Decode a Clarity read-only call result hex string to a JS number.
 * Handles:
 *  - Plain uint response:   01 + 32-hex uint128
 *  - (ok uint) response: 0701 + 32-hex uint128
 */
function decodeUint(hex: string): number {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (raw.startsWith("08")) throw new Error("Clarity returned err response");
  // (ok uint) wrapper
  if (raw.startsWith("0701")) return Number(BigInt("0x" + raw.slice(4)));
  // Plain uint
  if (raw.startsWith("01")) return Number(BigInt("0x" + raw.slice(2)));
  throw new Error(`Unexpected Clarity encoding: 0x${raw.slice(0, 6)}`);
}

async function readVaultUint(
  baseUrl: string,
  vaultAddr: string,
  vaultName: string,
  fnName: string
): Promise<number> {
  const url = `${baseUrl}/v2/contracts/call-read/${vaultAddr}/${vaultName}/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: vaultAddr, arguments: [] }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Stacks API ${res.status} for ${fnName}`);
  const json = (await res.json()) as { okay: boolean; result: string };
  if (!json.okay) throw new Error(`Contract error for ${fnName}`);
  return decodeUint(json.result);
}

export function useVaultStats() {
  const baseUrl = stacksNetwork.client.baseUrl;
  const [vaultAddr, vaultName] = CONTRACTS.VAULT.split(".");

  return useQuery<VaultStats>({
    queryKey: ["vaultStats"],
    enabled: !!vaultAddr && !!vaultName,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<VaultStats> => {
      if (!vaultAddr || !vaultName) throw new Error("Vault address not configured");

      const [deposited, cap, fee, feeBalance, minDep] = await Promise.allSettled([
        readVaultUint(baseUrl, vaultAddr, vaultName, "get-total-deposited"),
        readVaultUint(baseUrl, vaultAddr, vaultName, "get-tvl-cap"),
        readVaultUint(baseUrl, vaultAddr, vaultName, "get-fee-basis-points"),
        readVaultUint(baseUrl, vaultAddr, vaultName, "get-fee-balance"),
        readVaultUint(baseUrl, vaultAddr, vaultName, "get-min-deposit"),
      ]);

      return {
        totalDepositedSats: deposited.status === "fulfilled" ? deposited.value : 0,
        tvlCapSats:         cap.status === "fulfilled"      ? cap.value      : 50_000_000,
        feeBasisPoints:     fee.status === "fulfilled"      ? fee.value      : 500,
        feeBalanceSats:     feeBalance.status === "fulfilled" ? feeBalance.value : 0,
        minDepositSats:     minDep.status === "fulfilled"   ? minDep.value   : 1_000,
      };
    },
  });
}
