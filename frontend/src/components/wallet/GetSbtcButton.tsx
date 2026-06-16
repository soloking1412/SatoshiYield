import { useState } from "react";
import { GetSbtcModal } from "./GetSbtcModal.js";

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

/**
 * Header affordance for visitors who don't own sBTC yet. Mainnet only — on
 * testnet the FaucetButton dispenses test sBTC instead. Opens an explainer modal
 * that links to the official Stacks bridge.
 */
export function GetSbtcButton() {
  const [open, setOpen] = useState(false);
  if (!isMainnet) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "var(--accentD)",
          color: "var(--accent)",
          border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
          borderRadius: "var(--r-pill)",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          padding: "8px 16px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "transform .12s, background .15s",
        }}
        onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
        onMouseOut={(e) => (e.currentTarget.style.transform = "none")}
      >
        Get sBTC
      </button>
      {open && <GetSbtcModal onClose={() => setOpen(false)} />}
    </>
  );
}
