import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { connect, disconnect, request, isConnected, getLocalStorage } from "@stacks/connect";
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
  connect: () => Promise<void>;
  disconnect: () => void;
  callContract: (options: ContractCallOptions) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  // Restore address from localStorage on mount (survives page refresh)
  useEffect(() => {
    if (isConnected()) {
      const stored = getLocalStorage();
      const stxAddress = stored?.addresses?.stx?.[0]?.address ?? null;
      if (stxAddress) setAddress(stxAddress);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    const response = await connect({
      appDetails: { name: "SatoshiYield", icon: "/favicon.svg" },
    });
    const stxEntry = response?.addresses?.find(
      (a) => a.symbol === "STX" || a.address.startsWith("ST") || a.address.startsWith("SP")
    );
    setAddress(stxEntry?.address ?? null);
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setAddress(null);
  }, []);

  const callContract = useCallback(
    async (options: ContractCallOptions): Promise<string> => {
      const [contractAddress, contractName] = options.contractAddress.includes(".")
        ? options.contractAddress.split(".")
        : [options.contractAddress, options.contractName];

      const postConditionsHex = (options.postConditions ?? []).map((pc) =>
        postConditionToHex(pc)
      );

      const result = await request("stx_callContract", {
        contract: `${contractAddress}.${contractName ?? options.contractName}`,
        functionName: options.functionName,
        functionArgs: options.functionArgs,
        network: networkName,
        postConditions: postConditionsHex,
      });

      // Validate result shape — wallets should return { txid: string }
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
