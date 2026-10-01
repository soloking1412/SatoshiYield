import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { ClarityValue } from "@stacks/transactions";
import { cvToHex, postConditionToHex, validateStacksAddress } from "@stacks/transactions";
import { CONTRACTS, VAULT_VERSION } from "../constants/contracts.js";
import { networkName } from "../lib/stacksClient.js";
import { useToast } from "./ToastContext.js";
import { normalizeTxid, recordSubmittedCall } from "../lib/transactionJournal.js";

export type WalletId = "xverse" | "leather";

interface ContractCallOptions {
  /** Sender whose position, amount and protections were used to prepare this call. */
  expectedSender: string;
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditionMode?: "deny" | "allow";
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

// --- Wallet-extension detection (browser-injected globals) ------------------

/** Xverse injects `window.XverseProviders`. */
export function isXverseInstalled(): boolean {
  return typeof window !== "undefined" && !!window.XverseProviders;
}
interface LeatherProvider {
  request(method: string, params?: Record<string, unknown>): Promise<{ result?: unknown; error?: {message?: string} }>;
}
function leatherProvider(): LeatherProvider | undefined {
  return typeof window !== "undefined" ? (window as unknown as { LeatherProvider?: LeatherProvider }).LeatherProvider : undefined;
}
async function leatherRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const provider = leatherProvider();
  if (!provider) throw new Error("Leather is unavailable. Reconnect your wallet.");
  const response = await provider.request(method, params);
  if (response.error || !response.result) throw new Error(response.error?.message ?? "Invalid Leather response");
  return response.result;
}
/** Leather injects `window.LeatherProvider`. */
export function isLeatherInstalled(): boolean {
  return !!leatherProvider();
}

/** True when an error is just the user dismissing the wallet prompt. */
function isBenign(message: string, code?: number): boolean {
  if (code === -32000 || code === 4001) return true;
  const m = message.toLowerCase();
  return (
    m.includes("cancel") ||
    m.includes("reject") ||
    m.includes("denied") ||
    m.includes("dismiss")
  );
}

/** Select only an address for the configured network. */
function pickStxAddress(addresses: { address?: string }[]): string | null {
  const exact = addresses.find((a) => a.address?.startsWith(STX_PREFIX));
  if (exact?.address) return exact.address;
  return null;
}

/**
 * Xverse — via sats-connect's `wallet_connect` (Xverse's own canonical connect
 * method). We point sats-connect straight at Xverse so its built-in picker is
 * skipped — this app shows its own wallet modal.
 */
async function connectXverse(): Promise<string | null> {
  const {default: Wallet, getSupportedWallets, setDefaultProvider, AddressPurpose, BitcoinNetworkType} = await import("sats-connect");
  const BITCOIN_NETWORK = networkName === "mainnet" ? BitcoinNetworkType.Mainnet : BitcoinNetworkType.Testnet;
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
 * Leather — use its documented native provider RPC
 * (sats-connect cannot see Leather; it only reads the Bitcoin WBIP registry).
 */
async function connectLeather(): Promise<string | null> {
  const provider = leatherProvider();
  if (!provider) throw new Error("Leather is not installed");
  const res = await leatherRequest("getAddresses");
  const list = (res as { addresses?: { address?: string }[] }).addresses ?? [];
  return pickStxAddress(list);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { show } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [connector, setConnector] = useState<WalletId | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectingRef = useRef(false);
  const addressRef = useRef<string | null>(null);
  // Mirror of `connector` so callContract/disconnect read it without re-binding.
  const connectorRef = useRef<WalletId | null>(null);
  const sessionVersionRef = useRef(0);

  // Restore a previous session (survives a page refresh).
  useEffect(() => {
    try {
      const savedAddr = localStorage.getItem(ADDRESS_KEY);
      const savedConn = localStorage.getItem(CONNECTOR_KEY);
      if (
        savedAddr &&
        savedAddr.startsWith(STX_PREFIX) && validateStacksAddress(savedAddr) &&
        (savedConn === "xverse" || savedConn === "leather")
      ) {
        sessionVersionRef.current += 1;
        addressRef.current = savedAddr;
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

        if (!addr.startsWith(STX_PREFIX) || !validateStacksAddress(addr)) {
          const want = networkName === "mainnet" ? "Mainnet" : "Testnet";
          show({
            variant: "error",
            message: `Your wallet is on the wrong network. Switch it to ${want} and reconnect.`,
          });
          return;
        }

        sessionVersionRef.current += 1;
        addressRef.current = addr;
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
    sessionVersionRef.current += 1;
    const c = connectorRef.current;
    if (c === "xverse") {
      void import("sats-connect").then(async ({default: Wallet, removeDefaultProvider}) => {
        try { await Wallet.disconnect(); } finally { removeDefaultProvider(); }
      }).catch(() => {});
    }
    // Leather permissions are controlled in the wallet; clear this app's session.

    addressRef.current = null;
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
      if (!connectorRef.current || !addressRef.current) throw new Error("Reconnect your wallet before signing");
      const expectedAddress = options.expectedSender;
      const selectedConnector = connectorRef.current;
      const sessionVersion = sessionVersionRef.current;
      const assertSessionUnchanged = () => {
        if (!expectedAddress || addressRef.current !== expectedAddress ||
            connectorRef.current !== selectedConnector || sessionVersionRef.current !== sessionVersion) {
          throw new Error("Wallet session changed. Review the transaction again before signing.");
        }
      };
      assertSessionUnchanged();
      let xverseWallet: (typeof import("sats-connect"))["default"] | undefined;
      if (selectedConnector === "leather") {
        const current = await connectLeather();
        if (current !== expectedAddress) throw new Error("Wallet account or network changed. Reconnect before signing.");
      } else {
        const {default: Wallet} = await import("sats-connect");
        assertSessionUnchanged();
        xverseWallet = Wallet;
        const current = await Wallet.request("stx_getAddresses", {});
        if (current.status !== "success" ||
            current.result.network.stacks.name.toLowerCase() !== networkName ||
            !current.result.addresses.some(a => a.address === expectedAddress)) {
          throw new Error("Wallet account or network changed. Reconnect before signing.");
        }
      }
      assertSessionUnchanged();
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
      const postConditionMode = options.postConditionMode ?? "deny";
      if (postConditionMode === "allow" && (VAULT_VERSION !== "v6" || contract !== CONTRACTS.VAULT || !["withdraw", "request-withdraw", "claim-withdraw", "cancel-withdraw"].includes(options.functionName))) throw new Error("Allow mode is restricted to legacy exits");
      const recordSubmission = (value: unknown): string => {
        let txid: string;
        try { txid = normalizeTxid(value); }
        catch { throw new Error("The wallet did not return a valid transaction ID. Check wallet activity before retrying; submission status is unknown."); }
        try {
          recordSubmittedCall({txid,network:networkName,sender:expectedAddress,contract,functionName:options.functionName,functionArgs,postConditionMode,submittedAt:Date.now()});
        } catch {
          // A journal failure after a wallet broadcast must never be reported as a failed transaction.
          show({variant:"pending",message:"Transaction submitted, but local history could not be saved. Inspect the transaction before repeating it.",txid});
        }
        return txid;
      };

      // Leather — call the native provider selected during connection.
      if (selectedConnector === "leather") {
        const provider = leatherProvider();
        if (!provider) {
          throw new Error("Leather wallet unavailable — reconnect your wallet.");
        }
        assertSessionUnchanged();
        const res = await leatherRequest(
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
        return recordSubmission((res as { txid?: unknown }).txid);
      }

      // Xverse — route through sats-connect.
      if (!xverseWallet) throw new Error("Xverse is unavailable. Reconnect your wallet.");
      assertSessionUnchanged();
      const res = await xverseWallet.request("stx_callContract", {
        contract,
        functionName: options.functionName,
        functionArgs,
        postConditions,
        postConditionMode,
      });
      if (res.status === "error") {
        throw new Error(res.error?.message ?? "Wallet rejected the transaction");
      }
      return recordSubmission(res.result?.txid);
    },
    [show]
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
