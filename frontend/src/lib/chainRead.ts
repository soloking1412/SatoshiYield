import { cvToHex, hexToCV, serializeCV, ClarityType, type ClarityValue } from "@stacks/transactions";
import { stacksNetwork } from "./stacksClient.js";
export function decodeClarity(hex: string): ClarityValue {
  if (typeof hex !== "string" || !/^(0x)?(?:[\da-f]{2})+$/i.test(hex)) throw new Error("Malformed chain response");
  const value = hexToCV(hex);
  if (serializeCV(value).toLowerCase() !== hex.replace(/^0x/, "").toLowerCase()) throw new Error("Trailing data in chain response");
  if (value.type === ClarityType.ResponseErr) throw new Error("Contract read returned an error");
  return value.type === ClarityType.ResponseOk ? value.value : value;
}
export function requireUint(value: ClarityValue): bigint {
  if (value.type !== ClarityType.UInt) throw new Error("Expected an unsigned integer from chain");
  return BigInt(value.value);
}
export function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Chain value exceeds safe display precision");
  return Number(value);
}
export async function readContract(contract: string, fn: string, args: ClarityValue[] = [], sender?: string): Promise<ClarityValue> {
  const [address, name] = contract.split(".");
  if (!address || !name) throw new Error("Invalid contract identifier");
  const res = await fetch(`${stacksNetwork.client.baseUrl}/v2/contracts/call-read/${address}/${name}/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: sender ?? address, arguments: args.map(cvToHex) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Chain data unavailable (${res.status})`);
  const data: unknown = await res.json();
  if (!data || typeof data !== "object" || !("okay" in data) || data.okay !== true || !("result" in data) || typeof data.result !== "string") {
    throw new Error("Contract data unavailable; no balance has been assumed");
  }
  return decodeClarity(data.result);
}
