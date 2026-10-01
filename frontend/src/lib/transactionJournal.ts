import { validateStacksAddress } from "@stacks/transactions";
import { decodeClarity } from "./chainRead.js";

export type ChainNetwork = "mainnet" | "testnet";
export interface SubmittedCall {
  txid: string;
  network: ChainNetwork;
  sender: string;
  contract: string;
  functionName: string;
  functionArgs: string[];
  postConditionMode: "allow" | "deny";
  submittedAt: number;
}
export type ReceiptState =
  | "pending"
  | "success"
  | "failed"
  | "dropped"
  | "unavailable"
  | "mismatch";
export interface TransactionReceipt {
  state: ReceiptState;
  checkedAt: number;
  detail: string;
  blockHeight?: number;
  bitcoinConfirmations?: number;
  contractResult?: string;
}
const KEY = "satoshiyields.transaction-journal.v1";
const EMPTY: SubmittedCall[] = [];
let cachedRaw: string | null | undefined;
let cached: SubmittedCall[] = EMPTY;
let storageUnavailable = false;
const listeners = new Set<() => void>();
const TXID = /^0x[0-9a-f]{64}$/i;
const HEX = /^0x(?:[0-9a-f]{2})+$/i;
const NETWORK_PREFIX = { mainnet: /^S[PM]/, testnet: /^S[TN]/ };

export function normalizeTxid(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Wallet returned an invalid transaction ID");
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!TXID.test(normalized))
    throw new Error("Wallet returned an invalid transaction ID");
  return normalized.toLowerCase();
}
function validCall(value: unknown): value is SubmittedCall {
  if (!value || typeof value !== "object") return false;
  const call = value as SubmittedCall;
  if (call.network !== "mainnet" && call.network !== "testnet") return false;
  if (
    typeof call.sender !== "string" ||
    !NETWORK_PREFIX[call.network].test(call.sender) ||
    !validateStacksAddress(call.sender)
  )
    return false;
  const parts =
    typeof call.contract === "string" ? call.contract.split(".") : [];
  return (
    parts.length === 2 &&
    NETWORK_PREFIX[call.network].test(parts[0]!) &&
    validateStacksAddress(parts[0]!) &&
    /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(parts[1]!) &&
    typeof call.txid === "string" &&
    TXID.test(call.txid) &&
    typeof call.functionName === "string" &&
    /^[a-zA-Z][a-zA-Z0-9!?+<>=/*_-]{0,127}$/.test(call.functionName) &&
    Array.isArray(call.functionArgs) &&
    call.functionArgs.length <= 32 &&
    call.functionArgs.every(
      (a) => typeof a === "string" && a.length <= 32768 && HEX.test(a),
    ) &&
    ["allow", "deny"].includes(call.postConditionMode) &&
    Number.isSafeInteger(call.submittedAt) &&
    call.submittedAt > 0
  );
}
export function getSubmittedCalls(): SubmittedCall[] {
  if (storageUnavailable) return cached;
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cached;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const entries: unknown =
      raw && raw.length <= 1_000_000 ? JSON.parse(raw) : [];
    cached = Array.isArray(entries)
      ? entries.filter(validCall).slice(0, 100)
      : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}
export function subscribeTransactions(listener: () => void): () => void {
  listeners.add(listener);
  const storageChanged = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener("storage", storageChanged);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", storageChanged);
  };
}
function persist(entries: SubmittedCall[]) {
  cached = entries;
  cachedRaw = JSON.stringify(entries);
  try {
    localStorage.setItem(KEY, cachedRaw);
  } catch {
    storageUnavailable = true;
  }
  for (const listener of listeners) listener();
}
export function recordSubmittedCall(input: SubmittedCall): void {
  const call = {
    ...input,
    txid: normalizeTxid(input.txid),
    functionArgs: [...input.functionArgs],
  };
  if (!validCall(call))
    throw new Error("Cannot record a malformed transaction request");
  const entries = getSubmittedCalls();
  const previous = entries.find(
    (x) => x.txid === call.txid && x.network === call.network,
  );
  if (
    previous &&
    (previous.sender !== call.sender ||
      previous.contract !== call.contract ||
      previous.functionName !== call.functionName ||
      previous.postConditionMode !== call.postConditionMode ||
      JSON.stringify(previous.functionArgs) !==
        JSON.stringify(call.functionArgs))
  )
    throw new Error("Transaction ID is already bound to another request");
  if (previous) return;
  persist([call, ...entries].slice(0, 100));
}
export function clearTransactionHistory(sender: string, network: ChainNetwork) {
  persist(
    getSubmittedCalls().filter(
      (call) => call.sender !== sender || call.network !== network,
    ),
  );
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const positiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nowReceipt = (
  state: ReceiptState,
  detail: string,
): TransactionReceipt => ({ state, detail, checkedAt: Date.now() });

/** Checks the canonical receipt's sender, destination and exact call arguments.
 * This does not claim Bitcoin finality or attest wallet postconditions from API metadata. */
export function parseCanonicalReceipt(
  raw: unknown,
  call: SubmittedCall,
  infoRaw: unknown,
): TransactionReceipt {
  const tx = object(raw),
    info = object(infoRaw),
    sender = object(tx.sender),
    action = object(tx.contract_call),
    block = object(tx.block),
    bitcoin = object(tx.bitcoin_block);
  const expectedNetwork = call.network === "mainnet" ? 1 : 0x80000000;
  if (info.network_id !== expectedNetwork)
    return nowReceipt(
      "mismatch",
      "The RPC endpoint reported a different network.",
    );
  const args = Array.isArray(action.function_args)
    ? action.function_args.map((arg) => object(arg).hex)
    : null;
  if (
    tx.tx_id !== call.txid ||
    sender.address !== call.sender ||
    tx.type !== "contract_call" ||
    action.contract_id !== call.contract ||
    action.function_name !== call.functionName ||
    !args ||
    args.length !== call.functionArgs.length ||
    args.some(
      (arg, i) =>
        typeof arg !== "string" ||
        arg.toLowerCase() !== call.functionArgs[i]!.toLowerCase(),
    )
  )
    return nowReceipt(
      "mismatch",
      "The indexed transaction does not match the reviewed wallet request. Inspect it before taking another action.",
    );
  if (
    !positiveInt(block.height) ||
    !positiveInt(info.stacks_tip_height) ||
    block.height > info.stacks_tip_height ||
    !positiveInt(bitcoin.height) ||
    !positiveInt(info.burn_block_height) ||
    bitcoin.height > info.burn_block_height
  )
    return nowReceipt(
      "unavailable",
      "The transaction's canonical block could not be verified.",
    );
  const receipt = {
    checkedAt: Date.now(),
    blockHeight: block.height,
    bitcoinConfirmations: info.burn_block_height - bitcoin.height + 1,
  };
  const result = object(tx.result);
  if (tx.status === "success") {
    // An indexed success without its requested result is not enough to verify a contract response.
    if (
      typeof result.hex !== "string" ||
      !HEX.test(result.hex) ||
      !result.hex.toLowerCase().startsWith("0x07")
    )
      return nowReceipt(
        "unavailable",
        "The successful contract result could not be verified.",
      );
    try {
      decodeClarity(result.hex);
    } catch {
      return nowReceipt(
        "unavailable",
        "The successful contract result is malformed.",
      );
    }
    return {
      ...receipt,
      state: "success",
      detail:
        "Succeeded on the canonical Stacks chain. Bitcoin confirmations are shown separately.",
      contractResult:
        typeof result.repr === "string" ? result.repr.slice(0, 500) : undefined,
    };
  }
  if (
    [
      "abort_by_response",
      "abort_by_post_condition",
      "problematic_skipped",
    ].includes(String(tx.status))
  )
    return {
      ...receipt,
      state: "failed",
      detail:
        tx.status === "abort_by_post_condition"
          ? "The transaction failed its asset-spending guards. Network fees may still apply."
          : "The contract transaction failed. Check the result before retrying.",
      contractResult:
        typeof result.repr === "string" ? result.repr.slice(0, 500) : undefined,
    };
  return nowReceipt(
    "unavailable",
    "The API returned an unsupported transaction status.",
  );
}
async function jsonGet(
  url: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return { status: 404, body: null };
  if (!response.ok)
    throw new Error(`Transaction lookup unavailable (${response.status})`);
  return { status: response.status, body: await response.json() };
}
export async function fetchTransactionReceipt(
  call: SubmittedCall,
): Promise<TransactionReceipt> {
  if (!validCall(call))
    return nowReceipt("mismatch", "The saved request is malformed.");
  const base =
    call.network === "mainnet"
      ? "https://api.hiro.so"
      : "https://api.testnet.hiro.so";
  try {
    const [result, info] = await Promise.all([
      jsonGet(
        `${base}/extended/v3/transactions/${call.txid}?include=function_args,result`,
      ),
      jsonGet(`${base}/v2/info`),
    ]);
    if (
      object(info.body).network_id !==
      (call.network === "mainnet" ? 1 : 0x80000000)
    )
      return nowReceipt(
        "mismatch",
        "The RPC endpoint reported a different network.",
      );
    if (result.status !== 404)
      return parseCanonicalReceipt(result.body, call, info.body);
    // v3 confirmed-transaction resources only include canonical transactions.
    // A bounded principal mempool read establishes pending; a missing result is unknown, never success.
    const mempool = object(
      (
        await jsonGet(
          `${base}/extended/v3/principals/${call.sender}/mempool/transactions?limit=100`,
        )
      ).body,
    );
    const entries = Array.isArray(mempool.results) ? mempool.results : [];
    for (const entry of entries) {
      const outer = object(entry),
        tx = object(outer.transaction ?? outer);
      if (tx.tx_id !== call.txid) continue;
      if (object(tx.sender).address !== call.sender)
        return nowReceipt(
          "mismatch",
          "The pending transaction belongs to another sender.",
        );
      if (tx.status === "pending")
        return nowReceipt(
          "pending",
          "Waiting in the mempool. Submission has not changed your position yet.",
        );
      if (typeof tx.status === "string" && tx.status.startsWith("dropped_"))
        return nowReceipt(
          "dropped",
          "The transaction was dropped. Inspect its nonce and any replacement before retrying.",
        );
    }
    return nowReceipt(
      "unavailable",
      "No canonical receipt is available yet. The transaction may be indexing, dropped, or reorganized; do not assume it failed or resubmit automatically.",
    );
  } catch (error) {
    return nowReceipt(
      "unavailable",
      error instanceof Error
        ? error.message
        : "Transaction status unavailable.",
    );
  }
}
