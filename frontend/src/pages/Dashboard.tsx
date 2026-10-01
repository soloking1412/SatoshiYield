import { Link } from "react-router-dom";
import { YieldTable } from "../components/yields/YieldTable.js";
import { Icon } from "../components/shared/Icon.js";
export function Dashboard() {
  return <main id="main-content" className="page-shell" tabIndex={-1}>
    <div className="page-intro"><div><p className="eyebrow">The strategy directory</p><h1>Explore your next move.</h1><p>Compare the mechanics before the rate. Each route shows its asset, withdrawal model, and current availability in SatoshiYield.</p></div><Link className="text-link" to="/security">Understand the risks <Icon name="external" size={13} /></Link></div>
    <YieldTable />
  </main>;
}
