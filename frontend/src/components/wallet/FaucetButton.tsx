import { useState, useEffect, useRef } from "react";
import { request } from "@stacks/connect";
import { uintCV, standardPrincipalCV } from "@stacks/transactions";
import { useWallet } from "../../context/WalletContext.js";
import { DEPLOYER } from "../../constants/contracts.js";
import { networkName } from "../../lib/stacksClient.js";

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

export function FaucetButton() {
  const { address, isConnected } = useWallet();
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Only the deployer (contract owner) can mint mock-sBTC. Hidden on mainnet.
  if (isMainnet || !isConnected || !address || address !== DEPLOYER) return null;

  async function handleMint() {
    if (!address) return;
    setStatus("pending");
    try {
      await request("stx_callContract", {
        contract: `${DEPLOYER}.mock-sbtc`,
        functionName: "mint",
        functionArgs: [uintCV(10_000_000n), standardPrincipalCV(address)],
        network: networkName,
        postConditions: [],
      });
      setStatus("done");
      timerRef.current = setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      timerRef.current = setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const labels: Record<typeof status, string> = {
    idle: "Get Test sBTC",
    pending: "Requesting...",
    done: "Sent!",
    error: "Failed - retry",
  };

  return (
    <button
      onClick={() => void handleMint()}
      disabled={status === "pending"}
      className="px-3 py-1.5 rounded-md text-xs font-medium border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
    >
      {labels[status]}
    </button>
  );
}
