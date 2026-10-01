import { Link } from "react-router-dom";
export function NotFound() {
  return <main id="main-content" className="page-shell" tabIndex={-1}><div className="state-panel"><span className="eyebrow">404 / page not found</span><h1>This route is not in the register.</h1><p>The page may have moved. Return to the strategy directory to continue.</p><Link className="btn primary" to="/yields">Explore strategies</Link></div></main>;
}
