import { NavLink } from "react-router-dom";
import { Icon } from "../shared/Icon.js";
export function BottomTabs() {
  return <nav className="bottom-nav" aria-label="Mobile navigation">
    <NavLink to="/yields"><Icon name="grid" size={19} />Explore</NavLink>
    <NavLink to="/integrations"><Icon name="arrow" size={19} />Protocols</NavLink>
    <NavLink to="/portfolio"><Icon name="wallet" size={19} />Portfolio</NavLink>
    <NavLink to="/tvl"><Icon name="chart" size={19} />Transparency</NavLink>
    <NavLink to="/security"><Icon name="shield" size={19} />Risk & release</NavLink>
  </nav>;
}
