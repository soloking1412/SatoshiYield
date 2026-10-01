import { Link, NavLink } from "react-router-dom";
import { useWallet } from "../../context/WalletContext.js";
import { useTheme } from "../../context/ThemeContext.js";
import { useConnectModal } from "../../context/ConnectModalContext.js";
import { MarkSC } from "../shared/MarkSC.js";
import { Icon } from "../shared/Icon.js";
import { GetSbtcButton } from "../wallet/GetSbtcButton.js";
import { FaucetButton } from "../wallet/FaucetButton.js";
import { networkName } from "../../lib/stacksClient.js";
import { DEPOSITS_ENABLED } from "../../constants/contracts.js";

export function Header() {
  const { address, isConnected, isConnecting, disconnect } = useWallet();
  const { openConnectModal } = useConnectModal();
  const { theme, toggle } = useTheme();
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="SatoshiYield home"><MarkSC size={30} /><span>Satoshi<span>Yield</span></span></Link>
        <nav className="header-nav" aria-label="Main navigation">
          <NavLink to="/yields">Explore</NavLink><NavLink to="/integrations">Connect protocols</NavLink><NavLink to="/portfolio">Portfolio</NavLink><NavLink to="/tvl">Transparency</NavLink><NavLink to="/security">Risk & release</NavLink>
        </nav>
        <div className="header-actions">
          <span className="network-chip"><span className="network-dot" />{networkName}</span>
          <button className="icon-btn" onClick={toggle} aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} size={15} /></button>
          <div className="header-bridge"><GetSbtcButton /><FaucetButton /></div>
          {isConnected && address ? <div className="wallet-connected"><span className="mono" title={address}>{address.slice(0, 5)}…{address.slice(-4)}</span><button onClick={disconnect} aria-label="Disconnect wallet"><Icon name="close" size={14} /></button></div> : <button className="btn primary" disabled={isConnecting} onClick={openConnectModal}>{isConnecting ? "Connecting…" : "Connect wallet"}</button>}
        </div>
      </div>
    </header>
    {DEPOSITS_ENABLED && <div className="release-strip"><Icon name="info" size={13} /><span className="compact-network">{networkName}</span><strong>Testnet simulation.</strong><span>Mock assets and adapters. No real yield.</span><Link to="/security">View limitations ↗</Link></div>}
    {!DEPOSITS_ENABLED && <div className="release-strip"><Icon name="shield" size={13} /><span className="compact-network">{networkName}</span><strong>Vault release under review.</strong><span>New vault deposits are disabled.</span><Link to="/security">View release requirements <span aria-hidden="true">↗</span></Link></div>}
  </>;
}
