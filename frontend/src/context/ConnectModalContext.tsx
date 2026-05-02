import { createContext, useContext, useState, type ReactNode } from "react";
import { ConnectModal } from "../components/wallet/ConnectModal.js";

interface Ctx {
  openConnectModal: () => void;
}

const ConnectModalContext = createContext<Ctx>({ openConnectModal: () => {} });

export function ConnectModalProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <ConnectModalContext.Provider value={{ openConnectModal: () => setShow(true) }}>
      {children}
      {show && <ConnectModal onClose={() => setShow(false)} />}
    </ConnectModalContext.Provider>
  );
}

export function useConnectModal() {
  return useContext(ConnectModalContext);
}
