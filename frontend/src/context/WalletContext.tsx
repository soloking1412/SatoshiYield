import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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
  connectError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  callContract: (options: ContractCallOptions) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

/**
 * Pick the best STX address from a flat AddressEntry array.
 * Prefers the address matching the current network (ST for testnet, SP for mainnet).
 * Xverse returns both testnet and mainnet addresses; without this preference the
 * wrong address is sometimes selected.
 */
function pickBestAddress(
  entries: { symbol?: string; address?: string }[]
): string | null {
  const networkPrefix = networkName === "mainnet" ? "SP" : "ST";
  // 1. Exact network match
  const exact = entries.find((a) => a.address?.startsWith(networkPrefix));
  if (exact?.address) return exact.address;
  // 2. Any STX-labelled entry
  const stx = entries.find((a) => a.symbol === "STX");
  if (stx?.address) return stx.address;
  // 3. Any Stacks address
  const any = entries.find(
    (a) => a.address?.startsWith("ST") || a.address?.startsWith("SP")
  );
  return any?.address ?? null;
}

/** Read STX address from a connect() response or fall back to localStorage. */
function extractStxAddress(
  addresses?: unknown
): string | null {
  // 1. Flat array (Leather, standard format)
  if (Array.isArray(addresses) && addresses.length > 0) {
    const addr = pickBestAddress(addresses as { symbol?: string; address?: string }[]);
    if (addr) return addr;
  }

  // 2. Grouped object { testnet: [...], mainnet: [...] } — some Xverse versions
  if (addresses && typeof addresses === "object" && !Array.isArray(addresses)) {
    const grouped = addresses as Record<string, { address?: string }[]>;
    const preferred = networkName === "mainnet" ? grouped["mainnet"] : grouped["testnet"];
    if (Array.isArray(preferred) && preferred.length > 0 && preferred[0]?.address) {
      return preferred[0].address;
    }
    // Fall back to any group
    for (const list of Object.values(grouped)) {
      if (Array.isArray(list) && list.length > 0 && list[0]?.address) {
        return list[0].address;
      }
    }
  }

  // 3. @stacks/connect localStorage (written on successful connect)
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

/** Reject after ms milliseconds — used to race against hung wallet calls. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s — check if a wallet popup appeared behind this window`)),
      ms
    )
  );
  return Promise.race([promise, timer]);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Restore address from localStorage on mount (survives page refresh)
  useEffect(() => {
    if (isConnected()) {
      const addr = extractStxAddress();
      if (addr) setAddress(addr);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setConnectError(null);
    setIsConnecting(true);

    try {
      // Pass network so Xverse/Leather return the right addresses.
      // forceWalletSelect: true → always show picker so the user isn't stuck
      // on a previously-selected unresponsive wallet.
      // Timeout: surfaces a clear message if the extension never responds.
      const response = await withTimeout(
        connect({ forceWalletSelect: true, network: networkName }),
        60_000,
        "Wallet connection"
      );

      console.log("[wallet] connect() raw response:", JSON.stringify(response));

      let addr = extractStxAddress(response?.addresses);

      // Some wallets (Xverse, Asigna) return empty addresses from connect() but
      // respond correctly to a direct stx_getAddresses request.
      if (!addr) {
        try {
          const fallback = await withTimeout(
            request("stx_getAddresses", { network: networkName }),
            15_000,
            "stx_getAddresses"
          );
          console.log("[wallet] stx_getAddresses fallback:", JSON.stringify(fallback));
          // Response shape: { addresses: AddressEntry[] } or grouped object
          const raw = fallback as { addresses?: unknown };
          addr = extractStxAddress(raw?.addresses ?? fallback);
        } catch {
          /* fallback failed — try localStorage next */
        }
      }

      if (addr) {
        setAddress(addr);
      } else {
        // Last resort: @stacks/connect writes to localStorage on connect
        const stored = extractStxAddress();
        if (stored) {
          setAddress(stored);
        } else {
          setConnectError(
            "Wallet connected but returned no address. " +
              "Make sure your wallet is set to Testnet and try again."
          );
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.error("[wallet] connect() error:", msg);
      setConnectError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setAddress(null);
    setConnectError(null);
  }, []);

  const callContract = useCallback(
    async (options: ContractCallOptions): Promise<string> => {
      const contractAddr = options.contractAddress.includes(".")
        ? options.contractAddress
        : `${options.contractAddress}.${options.contractName}`;

      // Serialize ClarityValues to hex strings so wallets that JSON-serialize
      // args (Xverse, Asigna) don't fail on BigInt values inside UintCV etc.
      const argsHex = options.functionArgs.map((arg) =>
        typeof arg === "string" ? arg : cvToHex(arg)
      );

      // Post-conditions as hex strings — accepted by all @stacks/connect v8 wallets
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
        throw new Error("Wallet returned unexpected result — missing txid");
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
        connectError,
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
