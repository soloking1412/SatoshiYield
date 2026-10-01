import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { StacksRoutes } from "../components/StacksRoutes.js";
import { NativeBitcoinBond } from "../components/NativeBitcoinBond.js";
const BitcoinRoutes = lazy(() => import("../components/bitcoin/BitcoinRoutes.js"));
export function Integrations() {
  const [search] = useSearchParams();
  const [tab, setTab] = useState<"stacks" | "bitcoin">(() => search.get("tab") === "bitcoin" ? "bitcoin" : "stacks");
  return <main id="main-content" className="page-shell" tabIndex={-1}><div className="page-intro"><div><p className="eyebrow">Protocol connections</p><h1>One place. Clear routes.</h1><p>Review the asset, network and withdrawal path before acting. Each connection shows what can be executed and what is still preparation only.</p></div></div><div className="integration-tabs" aria-label="Integration network"><button aria-pressed={tab === "stacks"} onClick={() => setTab("stacks")}>Stacks protocols <span>Live checks · mainnet</span></button><button aria-pressed={tab === "bitcoin"} onClick={() => setTab("bitcoin")}>Bitcoin staking <span>Preparation & eligibility</span></button></div>{tab === "stacks" ? <StacksRoutes /> : <><Suspense fallback={<div className="state-panel" role="status">Loading Bitcoin connections…</div>}><BitcoinRoutes /></Suspense><NativeBitcoinBond /></>}</main>;
}
