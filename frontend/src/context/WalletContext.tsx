import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  connect,
  disconnect,
  request,
  isConnected,
  getLocalStorage,
} from "@stacks/connect";
import type { ClarityValue } from "@stacks/transactions";
import { cvToHex, postConditionToHex } from "@stacks/transactions";
import { networkName } from "../lib/stacksClient.js";
import { useToast } from "./ToastContext.js";

interface ContractCallOptions {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditions?: Parameters<typeof postConditionToHex>[0][];
}

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  callContract: (options: ContractCallOptions) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

/**
 * Pick the best STX address from a flat AddressEntry array.
 * Prefers the address matching the active network (ST for testnet, SP for
 * mainnet) — Xverse returns both, and without this preference the wrong one
 * is sometimes selected.
 */
function pickBestAddress(
  entries: { symbol?: string; address?: string }[]
): string | null {
  const networkPrefix = networkName === "mainnet" ? "SP" : "ST";
  const exact = entries.find((a) => a.address?.startsWith(networkPrefix));
  if (exact?.address) return exact.address;
  const stx = entries.find((a) => a.symbol === "STX");
  if (stx?.address) return stx.address;
  const any = entries.find(
    (a) => a.address?.startsWith("ST") || a.address?.startsWith("SP")
  );
  return any?.address ?? null;
}

/** Read an STX address from a connect() response, or fall back to localStorage. */
function extractStxAddress(addresses?: unknown): string | null {
  // Flat array (Leather, standard format).
  if (Array.isArray(addresses) && addresses.length > 0) {
    const addr = pickBestAddress(
      addresses as { symbol?: string; address?: string }[]
    );
    if (addr) return addr;
  }

  // Grouped object { testnet: [...], mainnet: [...] } — some Xverse versions.
  if (addresses && typeof addresses === "object" && !Array.isArray(addresses)) {
    const grouped = addresses as Record<string, { address?: string }[]>;
    const preferred =
      networkName === "mainnet" ? grouped["mainnet"] : grouped["testnet"];
    if (Array.isArray(preferred) && preferred.length > 0 && preferred[0]?.address) {
      return preferred[0].address;
    }
    for (const list of Object.values(grouped)) {
      if (Array.isArray(list) && list.length > 0 && list[0]?.address) {
        return list[0].address;
      }
    }
  }

  // @stacks/connect persists addresses to localStorage on a successful connect.
  try {
    const stored = getLocalStorage();
    const stxList = stored?.addresses?.stx;
    if (Array.isArray(stxList) && stxList.length > 0) {
      return pickBestAddress(stxList);
    }
  } catch {
    /* localStorage blocked */
  }

  return null;
}

/** Reject after `ms` milliseconds — bounds a hung wallet call. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** True when an error reflects the user dismissing the wallet prompt. */
function isUserCancellation(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("cancel") ||
    m.includes("reject") ||
    m.includes("denied") ||
    m.includes("declined") ||
    m.includes("closed")
  );
}

/** Map a raw connect error to a user-actionable message. */
function friendlyConnectError(msg: string): string {
  if (msg.toLowerCase().includes("timed out")) {
    return "Wallet didn't respond. Open your wallet extension, unlock it, set it to Testnet, then try again.";
  }
  return `Couldn't connect wallet: ${msg}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { show } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  // Guards against a second connect() while one is already in flight, which
  // would open two wallet pickers at once.
  const connectingRef = useRef(false);

  // Restore the address from localStorage on mount (survives a page refresh).
  useEffect(() => {
    if (isConnected()) {
      const addr = extractStxAddress();
      if (addr) setAddress(addr);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setIsConnecting(true);

    try {
      // forceWalletSelect: always show the @stacks/connect picker so the user
      // can choose any installed wallet (Leather, Xverse, Asigna…) and is never
      // stuck on a stale prior selection.
      const response = await withTimeout(
        connect({ forceWalletSelect: true, network: networkName }),
        90_000,
        "Wallet connection"
      );

      let addr = extractStxAddress(response?.addresses);

      // Some wallets return empty addresses from connect() but answer a direct
      // stx_getAddresses request.
      if (!addr) {
        try {
          const fallback = await withTimeout(
            request("stx_getAddresses", { network: networkName }),
            15_000,
            "stx_getAddresses"
          );
          const raw = fallback as { addresses?: unknown };
          addr = extractStxAddress(raw?.addresses ?? fallback);
        } catch {
          /* fall through to the localStorage check below */
        }
      }

      // Last resort: read whatever @stacks/connect persisted.
      if (!addr) addr = extractStxAddress();

      if (addr) {
        setAddress(addr);
      } else {
        show({
          variant: "error",
          message:
            "Wallet connected but returned no address. Make sure it is set to Testnet, then try again.",
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      // The user closing the picker is not an error — stay silent.
      if (!isUserCancellation(msg)) {
        console.error("[wallet] connect failed:", msg);
        show({ variant: "error", message: friendlyConnectError(msg) });
      }
    } finally {
      connectingRef.current = false;
      setIsConnecting(false);
    }
  }, [show]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setAddress(null);
  }, []);

  const callContract = useCallback(
    async (options: ContractCallOptions): Promise<string> => {
      const contractAddr = options.contractAddress.includes(".")
        ? options.contractAddress
        : `${options.contractAddress}.${options.contractName}`;

      // Serialize ClarityValues to hex so wallets that JSON-serialize args
      // (Xverse, Asigna) don't choke on BigInt values inside UintCV etc.
      const argsHex = options.functionArgs.map((arg) =>
        typeof arg === "string" ? arg : cvToHex(arg)
      );

      const postConditionsHex = (options.postConditions ?? []).map((pc) =>
        postConditionToHex(pc)
      );

      const result = await request("stx_callContract", {
        contract: contractAddr as `${string}.${string}`,
        functionName: options.functionName,
        functionArgs: argsHex,
        network: networkName,
        postConditions: postConditionsHex,
        postConditionMode: options.postConditions?.length ? "deny" : "allow",
      });

      if (typeof result !== "object" || result === null || !("txid" in result)) {
        throw new Error("Wallet returned an unexpected result — missing txid");
      }

      const txid = (result as Record<string, unknown>)["txid"];
      if (typeof txid !== "string" || txid.length === 0) {
        throw new Error("Wallet returned an empty txid");
      }

      return txid;
    },
    []
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: address !== null,
        isConnecting,
        connect: handleConnect,
        disconnect: handleDisconnect,
        callContract,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
