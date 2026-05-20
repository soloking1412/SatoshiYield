import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ConnectModal } from "../components/wallet/ConnectModal.js";

interface Ctx {
  /** Opens the app's wallet picker (Xverse / Leather). */
  openConnectModal: () => void;
}

const ConnectModalContext = createContext<Ctx>({ openConnectModal: () => {} });

/**
 * Owns the app's dark-themed wallet picker. Each wallet routes to the library
 * that reliably drives it — Xverse via sats-connect, Leather via @stacks/connect
 * — see WalletContext.
 */
export function ConnectModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ openConnectModal: () => setOpen(true) }), []);
  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </ConnectModalContext.Provider>
  );
}

export function useConnectModal() {
  return useContext(ConnectModalContext);
}
