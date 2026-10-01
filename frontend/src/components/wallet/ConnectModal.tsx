import { useEffect } from "react";
import { useWallet, isXverseInstalled, isLeatherInstalled, type WalletId } from "../../context/WalletContext.js";
import { networkName } from "../../lib/stacksClient.js";
import { Modal } from "../shared/Modal.js";
import { Icon } from "../shared/Icon.js";
export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { isConnected, isConnecting, connect } = useWallet();
  useEffect(() => { if (isConnected) onClose(); }, [isConnected, onClose]);
  const wallets: { id: WalletId; name: string; installed: boolean; url: string; letter: string }[] = [
    { id: "xverse", name: "Xverse", installed: isXverseInstalled(), url: "https://www.xverse.app/download", letter: "X" },
    { id: "leather", name: "Leather", installed: isLeatherInstalled(), url: "https://leather.io/install-extension", letter: "L" },
  ];
  return <Modal title="Connect your wallet" description={`Use a Stacks wallet on ${networkName}. Connecting lets this app read your address; every transaction requires a separate wallet approval.`} onClose={onClose}>
    {isConnecting ? <div className="state-panel" role="status"><span className="spinner" /><h2>Waiting for your wallet</h2><p>Review the connection request in your wallet extension.</p></div> : <div>{wallets.map((wallet) => {
      const contents = <><span className="protocol-icon" aria-hidden="true">{wallet.letter}</span><span><strong>{wallet.name}</strong><small>Bitcoin & Stacks wallet</small></span><span className="wallet-action">{wallet.installed ? "Connect" : "Install ↗"}</span></>;
      return wallet.installed ? <button className="wallet-choice" key={wallet.id} onClick={() => void connect(wallet.id)}>{contents}</button> : <a className="wallet-choice" key={wallet.id} href={wallet.url} target="_blank" rel="noopener noreferrer">{contents}</a>;
    })}</div>}
    <div className="notice" style={{ marginTop: 22 }}><Icon name="shield" size={16} /><div>This app will never ask for your recovery phrase or private key.</div></div>
  </Modal>;
}
