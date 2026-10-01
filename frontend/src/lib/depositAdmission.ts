import { ClarityType, contractPrincipalCV } from "@stacks/transactions";
import { CONTRACTS, DEPOSITS_ENABLED, DEPOSIT_BLOCK_REASON } from "../constants/contracts.js";
import { PROTOCOLS, type ProtocolId } from "../constants/protocols.js";
import { readContract, requireUint } from "./chainRead.js";

export interface DepositAdmission { available: boolean; reason: string; remainingSats: bigint }
const denied = (reason: string): DepositAdmission => ({ available: false, reason, remainingSats: 0n });
export async function fetchDepositAdmission(protocol: ProtocolId): Promise<DepositAdmission> {
  if (!DEPOSITS_ENABLED) return denied(DEPOSIT_BLOCK_REASON);
  if (!Object.hasOwn(PROTOCOLS, protocol)) throw new Error("Unknown integration");
  const adapter = CONTRACTS.ADAPTERS[protocol];
  const [address, name] = adapter.split(".");
  const arg = contractPrincipalCV(address!, name!);
  const [paused, binding, config] = await Promise.all([
    readContract(CONTRACTS.VAULT, "is-global-paused"),
    readContract(CONTRACTS.VAULT, "get-sbtc-token"),
    readContract(CONTRACTS.VAULT, "get-adapter-config", [arg]),
  ]);
  if (paused.type !== ClarityType.BoolTrue && paused.type !== ClarityType.BoolFalse) throw new Error("Invalid vault pause state");
  if (binding.type !== ClarityType.OptionalSome || binding.value.type !== ClarityType.PrincipalContract || binding.value.value !== CONTRACTS.SBTC_TOKEN) throw new Error("Vault asset binding could not be verified");
  if (paused.type === ClarityType.BoolTrue) return denied("The testnet vault is paused. Deposits will be available after onboarding completes.");
  if (config.type === ClarityType.OptionalNone) return denied("This test adapter has not completed on-chain approval.");
  if (config.type !== ClarityType.OptionalSome || config.value.type !== ClarityType.Tuple) throw new Error("Invalid adapter approval data");
  const fields = config.value.value;
  if (fields.enabled?.type !== ClarityType.BoolTrue) return denied("Deposits to this adapter are disabled.");
  if (fields["is-async"]?.type !== (PROTOCOLS[protocol].async ? ClarityType.BoolTrue : ClarityType.BoolFalse)) throw new Error("Adapter withdrawal type does not match the selected route");
  if (!fields.cap) throw new Error("Adapter capacity is unavailable");
  const cap = requireUint(fields.cap);
  const [exposure, adapterPaused, apy] = await Promise.all([
    readContract(CONTRACTS.VAULT, "get-adapter-deposited", [arg]).then(requireUint),
    readContract(adapter, "is-paused"),
    readContract(adapter, "get-apy").then(requireUint),
  ]);
  if (adapterPaused.type !== ClarityType.BoolFalse && adapterPaused.type !== ClarityType.BoolTrue) throw new Error("Invalid adapter pause state");
  if (adapterPaused.type === ClarityType.BoolTrue) return denied("This test adapter is paused.");
  // Reading the oracle successfully is a contract admission condition, not a promise of yield.
  void apy;
  if (exposure >= cap) return denied("This adapter has no remaining deposit capacity.");
  return { available: true, reason: "", remainingSats: cap - exposure };
}
