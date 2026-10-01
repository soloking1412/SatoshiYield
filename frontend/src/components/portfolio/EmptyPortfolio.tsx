import { Link } from "react-router-dom";
import { Icon } from "../shared/Icon.js";
export function EmptyPortfolio() {
  return <div className="state-panel"><div className="state-symbol"><Icon name="wallet" size={25} /></div><h2>No positions in this vault.</h2><p>No active position was returned for this wallet and the configured adapters. Explore the strategy register to understand the available routes.</p><Link className="btn primary" to="/yields">Explore strategies <Icon name="arrow" size={15} /></Link></div>;
}
