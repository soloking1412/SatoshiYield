import { SBTC_BRIDGE_URL, SBTC_BRIDGE_DOMAIN } from "../../constants/links.js";
import { Modal } from "../shared/Modal.js";
import { Icon } from "../shared/Icon.js";
export function GetSbtcModal({ onClose }: { onClose: () => void }) {
  return <Modal title="Get sBTC" description="sBTC is a Bitcoin-backed asset on Stacks, with its own signer and redemption assumptions. Review those terms before using the official bridge." onClose={onClose}>
    <a className="btn primary" style={{ width: "100%" }} href={SBTC_BRIDGE_URL} target="_blank" rel="noopener noreferrer">Open the sBTC bridge <Icon name="external" size={14} /></a>
    <p className="form-hint mono" style={{ textAlign: "center", marginTop: 12 }}>{SBTC_BRIDGE_DOMAIN}</p>
    <div className="notice" style={{ marginTop: 22 }}><Icon name="info" size={17} /><div>Opening the bridge takes you to a separate application. Owning sBTC does not mean SatoshiYield deposits are enabled. Check the integration status before moving funds.</div></div>
  </Modal>;
}
