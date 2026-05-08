import { useState, useEffect, useRef } from "react";
import { useWallet } from "../../context/WalletContext.js";
import { useQueryClient } from "@tanstack/react-query";

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? "http://localhost:3001";

export function FaucetButton() {
  const { address, isConnected } = useWallet();
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error" | "cooldown">("idle");
  const [cooldownMs, setCooldownMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (isMainnet || !isConnected || !address) return null;

  async function handleMint() {
    if (!address) return;
    setStatus("pending");
    try {
      const res = await fetch(`${INDEXER_URL}/api/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json() as { txid?: string; error?: string; nextAvailableMs?: number };
      if (!res.ok) {
        if (res.status === 429 && json.nextAvailableMs) {
          setCooldownMs(json.nextAvailableMs);
          setStatus("cooldown");
          timerRef.current = setTimeout(() => setStatus("idle"), 5000);
        } else {
          setStatus("error");
          timerRef.current = setTimeout(() => setStatus("idle"), 3000);
        }
        return;
      }
      setStatus("done");
      void queryClient.invalidateQueries({ queryKey: ["balance", address] });
      timerRef.current = setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      timerRef.current = setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const mins = Math.ceil(cooldownMs / 60_000);
  const labels: Record<typeof status, string> = {
    idle: "Get Test sBTC",
    pending: "Requesting...",
    done: "0.1 sBTC sent!",
    error: "Failed — retry",
    cooldown: `Try again in ${mins}m`,
  };

  return (
    <button
      onClick={() => void handleMint()}
      disabled={status === "pending" || status === "cooldown"}
      className="px-3 py-1.5 rounded-md text-xs font-medium border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
    >
      {labels[status]}
    </button>
  );
}
