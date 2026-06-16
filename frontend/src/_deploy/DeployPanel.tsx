// TEMP one-time mainnet deploy panel — publishes vault-v6 + zest-earn-adapter as
// CLARITY 3 (the Stacks Explorer Sandbox is C4-only, and our contracts use
// `as-contract` which C4 renamed to `as-contract?`). Wallet-signed via the app's
// existing @stacks/connect wiring — the private key NEVER leaves the wallet.
//
// DELETE after launch: this file, the `/deploy` route in App.tsx, the
// `deployContract` method in WalletContext.tsx, and public/_contracts/.
import { useState } from "react";
import { useWallet } from "../context/WalletContext.js";

const DEPLOYER = "SP31VHZWD3QMGHEEZ30GNK7NB9PF1F9FSEV00149V";

// Deploy in this order; vault-v6 must confirm before zest-earn-adapter is useful.
const CONTRACTS = [
  { name: "vault-v6", src: "/_contracts/vault-v6.clar" },
  { name: "zest-earn-adapter", src: "/_contracts/zest-earn-adapter.clar" },
] as const;

export function DeployPanel() {
  const { address, isConnected, connect, deployContract } = useWallet();
  const [status, setStatus] = useState<Record<string, string>>({});
  const [txid, setTxid] = useState<Record<string, string>>({});

  const wrongWallet = isConnected && address !== DEPLOYER;

  const deploy = async (name: string, src: string) => {
    try {
      setStatus((s) => ({ ...s, [name]: "Loading source…" }));
      const code = await fetch(src).then((r) => {
        if (!r.ok) throw new Error(`could not load ${src} (${r.status})`);
        return r.text();
      });
      setStatus((s) => ({ ...s, [name]: "Awaiting wallet signature…" }));
      const id = await deployContract(name, code, 3);
      setTxid((t) => ({ ...t, [name]: id }));
      setStatus((s) => ({ ...s, [name]: "Submitted — confirm on the explorer" }));
    } catch (e) {
      setStatus((s) => ({ ...s, [name]: `Error: ${(e as Error).message}` }));
    }
  };

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 32, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>One-time Clarity 3 deploy</h1>
      <p style={{ color: "var(--muted)" }}>
        Wallet-signed — your key never leaves the wallet. Deployer/owner must be:
        <br />
        <code>{DEPLOYER}</code>
      </p>

      {!isConnected ? (
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button onClick={() => void connect("leather")} style={btn}>
            Connect Leather
          </button>
          <button onClick={() => void connect("xverse")} style={btn}>
            Connect Xverse
          </button>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 16 }}>
            Connected: <code>{address}</code>
          </p>
          {wrongWallet && (
            <p style={{ color: "var(--neg, #c00)", fontWeight: 600 }}>
              ⚠ This is NOT the deployer wallet. Switch your wallet to {DEPLOYER} before deploying.
            </p>
          )}
          {CONTRACTS.map((c) => (
            <div
              key={c.name}
              style={{ margin: "18px 0", padding: 16, border: "1px solid var(--border, #333)", borderRadius: 10 }}
            >
              <button disabled={wrongWallet} onClick={() => void deploy(c.name, c.src)} style={btn}>
                Deploy {c.name} (Clarity 3)
              </button>
              <div style={{ fontSize: 13, marginTop: 8, color: "var(--muted)" }}>
                {status[c.name] ?? "Not deployed yet"}
              </div>
              {txid[c.name] && (
                <a
                  href={`https://explorer.hiro.so/txid/${txid[c.name]}?chain=mainnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: "var(--accent, #3b82f6)" }}
                >
                  {txid[c.name]} ↗
                </a>
              )}
            </div>
          ))}
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            Deploy vault-v6 first and wait for it to confirm before zest-earn-adapter.
            The 3 traits are already deployed (Clarity 4) — they're reused as-is.
          </p>
        </>
      )}
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid var(--border, #333)",
  background: "var(--accent, #3b82f6)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
