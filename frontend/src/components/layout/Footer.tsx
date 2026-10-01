import { Link } from "react-router-dom";
import { MarkSC } from "../shared/MarkSC.js";
export function Footer() {
  return <footer className="site-footer">
    <div className="footer-inner">
      <div><Link to="/" className="brand"><MarkSC size={25} /><span>Satoshi<span>Yield</span></span></Link><p>Bitcoin yield routes on Stacks. Understand the asset, the strategy, and the way back out.</p></div>
      <div className="footer-links"><Link to="/security">Risk & release</Link><Link to="/tvl">Contracts & data</Link><a href="https://github.com/soloking1412/SatoshiYield" target="_blank" rel="noopener noreferrer">Source code ↗</a><a href="https://docs.stacks.co" target="_blank" rel="noopener noreferrer">Stacks docs ↗</a></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} SatoshiYield</span><span>Variable returns. Capital at risk. No guarantee of principal or yield.</span></div>
  </footer>;
}
