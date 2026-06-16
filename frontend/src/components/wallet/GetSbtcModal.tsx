import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SBTC_BRIDGE_URL, SBTC_BRIDGE_DOMAIN } from "../../constants/links.js";

/**
 * Onboarding helper for visitors who don't yet hold sBTC. We are non-custodial
 * and never bridge/swap funds ourselves — this just points users at the official
 * Stacks bridge (BTC -> sBTC) and explains the path. Opens in a new tab.
 *
 * Rendered via a portal to document.body: this modal is triggered from inside the
 * Header, whose `backdrop-filter` makes it the containing block for any fixed
 * descendant — without the portal, `inset: 0` resolves to the 60px nav (the modal
 * gets clipped to the top), not the viewport.
 */
export function GetSbtcModal({ onClose }: { onClose: () => void }) {
  // Close on Escape and lock background scroll while the modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Get sBTC"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--modalBg)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn .2s ease",
      }}
    >
      <div
        style={{
          background: "var(--cardBg)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "26px 24px",
          width: "100%",
          maxWidth: 380,
          animation: "modalUp .3s cubic-bezier(.34,1.56,.64,1) both",
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Get sBTC</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 2 }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.55 }}>
          sBTC is Bitcoin on Stacks — 1:1 backed and non-custodial. To get some, deposit
          BTC through the <strong style={{ color: "var(--text)" }}>official Stacks bridge</strong>,
          then come back here to earn yield on it.
        </div>

        <a
          href={SBTC_BRIDGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            background: "var(--accent)",
            color: "var(--onAccent)",
            textDecoration: "none",
            borderRadius: 12,
            padding: "13px 16px",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>Open the sBTC bridge ↗</span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10.5,
              fontWeight: 600,
              opacity: 0.8,
            }}
          >
            {SBTC_BRIDGE_DOMAIN}
          </span>
        </a>

        <div style={{ fontSize: 11.5, color: "var(--lo)", marginTop: 14, lineHeight: 1.5 }}>
          Already hold STX or other Stacks assets? You can also swap them for sBTC on a
          Stacks DEX. Bridging needs a connected Stacks wallet (Xverse or Leather).
        </div>
      </div>
    </div>,
    document.body
  );
}
