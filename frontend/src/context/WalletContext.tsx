import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import Wallet, {
  AddressPurpose,
  BitcoinNetworkType,
  RpcErrorCode,
  getSupportedWallets,
  setDefaultProvider,
  removeDefaultProvider,
} from "sats-connect";
import {
  request as stacksRequest,
  disconnect as stacksDisconnect,
} from "@stacks/connect";
import type { ClarityValue } from "@stacks/transactions";
import { cvToHex, postConditionToHex } from "@stacks/transactions";
import { networkName } from "../lib/stacksClient.js";
import { useToast } from "./ToastContext.js";

export type WalletId = "xverse" | "leather";

interface ContractCallOptions {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditions?: Parameters<typeof postConditionToHex>[0][];
}

interface WalletState {
  address: string | null;
  connector: WalletId | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: () => void;
  callContract: (options: ContractCallOptions) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

const ADDRESS_KEY = "satoshi.stx-address";
const CONNECTOR_KEY = "satoshi.stx-connector";
const STX_PREFIX = networkName === "mainnet" ? "SP" : "ST";
const BITCOIN_NETWORK =
  networkName === "mainnet" ? BitcoinNetworkType.Mainnet : BitcoinNetworkType.Testnet;

// --- Wallet-extension detection (browser-injected globals) ------------------

/** Xverse injects `window.XverseProviders`. */
export function isXverseInstalled(): boolean {
  return typeof window !== "undefined" && !!window.XverseProviders;
}
function leatherProvider(): unknown {
  return typeof window !== "undefined"
    ? (window as { LeatherProvider?: unknown }).LeatherProvider
    : undefined;
}
/** Leather injects `window.LeatherProvider`. */
export function isLeatherInstalled(): boolean {
  return !!leatherProvider();
}

/** True when an error is just the user dismissing the wallet prompt. */
function isBenign(message: string, code?: number): boolean {
  if (code === RpcErrorCode.USER_REJECTION) return true;
  const m = message.toLowerCase();
  return (
    m.includes("cancel") ||
    m.includes("reject") ||
    m.includes("denied") ||
    m.includes("dismiss")
  );
}

/** Pick the address matching the active network, else any Stacks address. */
function pickStxAddress(addresses: { address?: string }[]): string | null {
  const exact = addresses.find((a) => a.address?.startsWith(STX_PREFIX));
  if (exact?.address) return exact.address;
  const any = addresses.find(
    (a) => a.address?.startsWith("ST") || a.address?.startsWith("SP")
  );
  return any?.address ?? null;
}

/**
 * Xverse — via sats-connect's `wallet_connect` (Xverse's own canonical connect
 * method). We point sats-connect straight at Xverse so its built-in picker is
 * skipped — this app shows its own wallet modal.
 */
async function connectXverse(): Promise<string | null> {
  const xverse = getSupportedWallets().find((w) => /xverse/i.test(w.name));
  if (xverse) setDefaultProvider(xverse.id);

  const res = await Wallet.request("wallet_connect", {
    addresses: [AddressPurpose.Stacks],
    message: "Connect to SatoshiYields",
    network: BITCOIN_NETWORK,
  });
  if (res.status === "error") {
    if (isBenign(res.error?.message ?? "", res.error?.code)) return null;
    throw new Error(res.error?.message ?? "Xverse connection failed");
  }
  const stx = res.result.addresses.find((a) => a.purpose === AddressPurpose.Stacks);
  return stx?.address ?? null;
}

/**
 * Leather — via @stacks/connect targeted directly at the Leather provider
 * (sats-connect cannot see Leather; it only reads the Bitcoin WBIP registry).
 */
async function connectLeather(): Promise<string | null> {
  const provider = leatherProvider();
  if (!provider) throw new Error("Leather is not installed");
  const res = await stacksRequest(
    { provider: provider as never, forceWalletSelect: false },
    "getAddresses",
    { network: networkName }
  );
  const list = (res as { addresses?: { address?: string }[] }).addresses ?? [];
  return pickStxAddress(list);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { show } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [connector, setConnector] = useState<WalletId | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectingRef = useRef(false);
  // Mirror of `connector` so callContract/disconnect read it without re-binding.
  const connectorRef = useRef<WalletId | null>(null);

  // Restore a previous session (survives a page refresh).
  useEffect(() => {
    try {
      const savedAddr = localStorage.getItem(ADDRESS_KEY);
      const savedConn = localStorage.getItem(CONNECTOR_KEY);
      if (
        savedAddr &&
        savedAddr.startsWith(STX_PREFIX) &&
        (savedConn === "xverse" || savedConn === "leather")
      ) {
        setAddress(savedAddr);
        setConnector(savedConn);
        connectorRef.current = savedConn;
      }
    } catch {
      /* localStorage blocked */
    }
  }, []);

  const handleConnect = useCallback(
    async (walletId: WalletId) => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      setIsConnecting(true);
      try {
        const addr =
          walletId === "xverse" ? await connectXverse() : await connectLeather();
        if (!addr) return; // user dismissed the prompt

        if (!addr.startsWith(STX_PREFIX)) {
          const want = networkName === "mainnet" ? "Mainnet" : "Testnet";
          show({
            variant: "error",
            message: `Your wallet is on the wrong network. Switch it to ${want} and reconnect.`,
          });
          return;
        }

        setAddress(addr);
        setConnector(walletId);
        connectorRef.current = walletId;
        try {
          localStorage.setItem(ADDRESS_KEY, addr);
          localStorage.setItem(CONNECTOR_KEY, walletId);
        } catch {
          /* localStorage blocked */
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "");
        if (!isBenign(message)) {
          console.error("[wallet] connect failed:", message);
          show({
            variant: "error",
            message:
              walletId === "leather"
                ? "Couldn't connect Leather. Make sure it's installed and unlocked, then try again."
                : "Couldn't connect Xverse. Make sure it's installed and unlocked, then try again.",
          });
        }
      } finally {
        connectingRef.current = false;
        setIsConnecting(false);
      }
    },
    [show]
  );

  const handleDisconnect = useCallback(() => {
    const c = connectorRef.current;
    if (c === "xverse") {
      void Wallet.disconnect().catch(() => {});
      try {
        removeDefaultProvider();
      } catch {
        /* ignore */
      }
    } else if (c === "leather") {
      try {
        stacksDisconnect();
      } catch {
        /* ignore */
      }
    }
    setAddress(null);
    setConnector(null);
    connectorRef.current = null;
    try {
      localStorage.removeItem(ADDRESS_KEY);
      localStorage.removeItem(CONNECTOR_KEY);
    } catch {
      /* localStorage blocked */
    }
  }, []);

  const callContract = useCallback(
    async (options: ContractCallOptions): Promise<string> => {
      const contract = options.contractAddress.includes(".")
        ? options.contractAddress
        : `${options.contractAddress}.${options.contractName}`;

      // Serialize ClarityValues + post-conditions to hex — the format every
      // SIP-010 wallet expects for stx_callContract.
      const functionArgs = options.functionArgs.map((arg) =>
        typeof arg === "string" ? arg : cvToHex(arg)
      );
      const postConditions = (options.postConditions ?? []).map((pc) =>
        postConditionToHex(pc)
      );
      const postConditionMode = options.postConditions?.length ? "deny" : "allow";

      // Leather — route through @stacks/connect, the provider it connected with.
      if (connectorRef.current === "leather") {
        const provider = leatherProvider();
        if (!provider) {
          throw new Error("Leather wallet unavailable — reconnect your wallet.");
        }
        const res = await stacksRequest(
          { provider: provider as never },
          "stx_callContract",
          {
            contract: contract as `${string}.${string}`,
            functionName: options.functionName,
            functionArgs,
            network: networkName,
            postConditions,
            postConditionMode,
          }
        );
        const txid = (res as { txid?: unknown }).txid;
        if (typeof txid !== "string" || txid.length === 0) {
          throw new Error("Wallet returned no transaction id");
        }
        return txid;
      }

      // Xverse — route through sats-connect.
      const res = await Wallet.request("stx_callContract", {
        contract,
        functionName: options.functionName,
        functionArgs,
        postConditions,
        postConditionMode,
      });
      if (res.status === "error") {
        throw new Error(res.error?.message ?? "Wallet rejected the transaction");
      }
      if (!res.result?.txid) {
        throw new Error("Wallet returned no transaction id");
      }
      return res.result.txid;
    },
    []
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        connector,
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
