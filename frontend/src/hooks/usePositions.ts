import { useQuery } from "@tanstack/react-query";
import { ClarityType, standardPrincipalCV, contractPrincipalCV, type ClarityValue } from "@stacks/transactions";
import { CONTRACTS, VAULT_VERSION } from "../constants/contracts.js";
import { networkName } from "../lib/stacksClient.js";
import { readContract, requireUint, safeNumber } from "../lib/chainRead.js";
import { useWallet } from "../context/WalletContext.js";
import type { UserPosition } from "../types/position.js";
import type { ProtocolId } from "../types/yield.js";
const ADAPTER_BY_PRINCIPAL: Record<string, ProtocolId> = Object.fromEntries(Object.entries(CONTRACTS.ADAPTERS).map(([k,v]) => [v,k as ProtocolId]));
function principal(value: ClarityValue | undefined): string {
  if (!value || value.type !== ClarityType.PrincipalContract) throw new Error("Invalid adapter in position");
  return value.value;
}
export function parsePosition(value: ClarityValue, adapter?: string): UserPosition | null {
  if (value.type === ClarityType.OptionalNone) return null;
  if (value.type !== ClarityType.OptionalSome || value.value.type !== ClarityType.Tuple) throw new Error("Malformed position data");
  const fields = value.value.value;
  const uint = (key: string) => { const v = fields[key]; if (!v) throw new Error(`Missing position ${key}`); return requireUint(v); };
  const adapterId = adapter ?? principal(fields.adapter);
  const asyncValue = fields["is-async"];
  if (!asyncValue || ![ClarityType.BoolTrue, ClarityType.BoolFalse].includes(asyncValue.type)) throw new Error("Invalid withdrawal type");
  const status = uint("status");
  if (status !== 0n && status !== 1n) throw new Error("Unknown position state");
  return {
    adapter: adapterId, protocol: ADAPTER_BY_PRINCIPAL[adapterId] ?? null,
    principalSats: uint("principal-amount"), depositedAt: safeNumber(uint("deposited-at")),
    isAsync: asyncValue.type === ClarityType.BoolTrue, status: status === 1n ? "pending" : "active",
    claimId: safeNumber(uint("claim-id")),
    ...(fields["fee-bps"] ? {feeBps:safeNumber(uint("fee-bps"))} : {}),
    ...(fields["credited-shares"] ? {creditedShares:uint("credited-shares")} : {}),
  };
}
export async function fetchPositions(address: string): Promise<UserPosition[]> {
  if (VAULT_VERSION === "v6") {
    const p = parsePosition(await readContract(CONTRACTS.VAULT,"get-position",[standardPrincipalCV(address)],address));
    return p ? [p] : [];
  }
  const positions = await Promise.all(Object.values(CONTRACTS.ADAPTERS).map(async (adapter) => {
    const [addr,name] = adapter.split(".");
    return parsePosition(await readContract(CONTRACTS.VAULT,"get-position",[standardPrincipalCV(address),contractPrincipalCV(addr!,name!)],address),adapter);
  }));
  return positions.filter((p):p is UserPosition => p !== null);
}
export function usePositions() {
  const { address } = useWallet();
  const query = useQuery({queryKey:["position",address,networkName,CONTRACTS.VAULT],enabled:!!address,refetchInterval:15_000,staleTime:0,queryFn:() => {
    if (!address) throw new Error("Wallet not connected");
    return fetchPositions(address);
  }});
  return {...query, positions:query.data ?? [], data:query.data?.[0] ?? null};
}
