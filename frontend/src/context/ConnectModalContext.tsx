import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWallet } from "./WalletContext.js";

interface Ctx {
  /** Opens the @stacks/connect wallet picker. */
  openConnectModal: () => void;
}

const ConnectModalContext = createContext<Ctx>({ openConnectModal: () => {} });

/**
 * Wallet connection is handled entirely by the @stacks/connect picker — it
 * already renders a polished, multi-wallet modal. Rendering a second app-owned
 * overlay on top of it blocked some wallets (notably Xverse) from surfacing
 * their approval popup, so this provider just forwards to wallet.connect().
 */
export function ConnectModalProvider({ children }: { children: ReactNode }) {
  const { connect } = useWallet();
  const value = useMemo(
    () => ({ openConnectModal: () => void connect() }),
    [connect]
  );
  return (
    <ConnectModalContext.Provider value={value}>
      {children}
    </ConnectModalContext.Provider>
  );
}

export function useConnectModal() {
  return useContext(ConnectModalContext);
}
