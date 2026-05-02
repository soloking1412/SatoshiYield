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
import { postConditionToHex } from "@stacks/transactions";
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

/** Read STX address from a flat AddressEntry array or fall back to localStorage. */
function extractStxAddress(
  addresses?: { symbol?: string; address: string }[]
): string | null {
  // 1. From the connect() response (flat array)
  if (Array.isArray(addresses) && addresses.length > 0) {
    const entry = addresses.find(
      (a) =>
        a.symbol === "STX" ||
        a.address?.startsWith("ST") ||
        a.address?.startsWith("SP")
    );
    if (entry?.address) return entry.address;
  }

  // 2. Fall back to @stacks/connect localStorage
  try {
    const stored = getLocalStorage();
    const stxList = stored?.addresses?.stx;
    if (Array.isArray(stxList) && stxList.length > 0) {
      const testnet = stxList.find((a) => a.address?.startsWith("ST"));
      return testnet?.address ?? stxList[0]?.address ?? null;
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

      // Xverse sometimes returns empty addresses from connect() but responds
      // correctly to a direct stx_getAddresses request — try that as fallback.
      if (!addr) {
        try {
          const fallback = await withTimeout(
            request("stx_getAddresses", { network: networkName }),
            15_000,
            "stx_getAddresses"
          );
          console.log("[wallet] stx_getAddresses fallback:", JSON.stringify(fallback));
          addr = extractStxAddress(
            (fallback as { addresses?: { symbol?: string; address: string }[] })
              ?.addresses
          );
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
      const [addr, name] = options.contractAddress.includes(".")
        ? options.contractAddress.split(".")
        : [options.contractAddress, options.contractName];

      const postConditionsHex = (options.postConditions ?? []).map((pc) =>
        postConditionToHex(pc)
      );

      const result = await request("stx_callContract", {
        contract: `${addr}.${name ?? options.contractName}`,
        functionName: options.functionName,
        functionArgs: options.functionArgs as ClarityValue[],
        network: networkName,
        postConditions: postConditionsHex,
        postConditionMode: options.postConditions?.length ? "deny" : "allow",
      });

      if (typeof result !== "object" || result === null || !("txid" in result)) {
        throw new Error("Wallet returned unexpected result (missing txid)");
      }

      const txid = (result as Record<string, unknown>)["txid"];
      if (typeof txid !== "string" || txid.length === 0) {
        throw new Error("Wallet returned invalid txid");
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
