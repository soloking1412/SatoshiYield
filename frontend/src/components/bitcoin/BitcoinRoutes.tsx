import {useEffect,useRef,useState} from 'react';
import type {BabylonContext,BabylonStakePlan,BitcoinWalletBinding,LombardDepositInstruction,LombardQuote} from '../../../../integrations/bitcoin/src/types.js';
import type {LombardStakeSession} from '../../../../integrations/bitcoin/src/lombard.js';
import {connectBitcoinSignet,connectSepolia,verifyBitcoinSignetWallet,type BrowserEvmProvider} from './wallets.js';
import './bitcoin.css';

const moduleApi=()=>import('../../../../integrations/bitcoin/src/index.js');
const btc=(sats:number)=>`${Math.floor(sats/100_000_000)}.${String(sats%100_000_000).padStart(8,'0')}`;
const short=(s:string)=>`${s.slice(0,10)}…${s.slice(-6)}`;
const message=(e:unknown)=>e instanceof Error?e.message:'The route could not be verified. Try again.';
function Rows({items}:{items:[string,string][]}) {return <dl className="definition-list">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}

function BabylonRoute() {
  const [context,setContext]=useState<BabylonContext|null>(null);
  const [wallet,setWallet]=useState<BitcoinWalletBinding|null>(null);
  const [providerKey,setProviderKey]=useState('');
  const [amount,setAmount]=useState('');
  const [blocks,setBlocks]=useState('10000');
  const [feeRate,setFeeRate]=useState('2');
  const [maxFee,setMaxFee]=useState('0.00005');
  const [plan,setPlan]=useState<BabylonStakePlan|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState('');
  const epoch=useRef(0);
  useEffect(()=>()=>{epoch.current++},[]);
  function clearPlan(){epoch.current++;setPlan(null);setError('')}
  async function inspect(){
    clearPlan();const active=epoch.current;setBusy('Reading network…');
    try {const api=await moduleApi();const c=await api.fetchBabylonSignetContext();if(epoch.current!==active)return;setContext(c);setBlocks(String(c.parameters.filter(p=>p.btcActivationHeight<=c.babylonBitcoinTipHeight).at(-1)!.minStakingTimeBlocks));setProviderKey('')}
    catch(e){if(epoch.current===active)setError(message(e))}finally{setBusy('')}
  }
  async function connect(){clearPlan();const active=epoch.current;setBusy('Connecting…');try{const w=await connectBitcoinSignet();if(epoch.current===active)setWallet(w)}catch(e){if(epoch.current===active)setError(message(e))}finally{setBusy('')}}
  async function prepare(){
    clearPlan();const active=epoch.current;setBusy('Checking test coins…');
    try{
      if(!wallet)throw new Error('Connect your Signet payment account first.');
      if(!providerKey)throw new Error('Choose a finality provider.');
      await verifyBitcoinSignetWallet(wallet);
      const api=await moduleApi();
      const [fresh,utxos]=await Promise.all([api.fetchBabylonSignetContext(),api.fetchSignetUtxos(wallet.address)]);
      const result=await api.buildBabylonStakePlan({wallet,context:fresh,finalityProviderPublicKey:providerKey,stakingSats:api.parseBtcAmount(amount),stakingBlocks:Number(blocks),feeRateSatVb:Number(feeRate),maxFeeSats:api.parseBtcAmount(maxFee),utxos});
      await verifyBitcoinSignetWallet(wallet);
      if(epoch.current===active){setContext(fresh);setPlan(result)}
    }catch(e){if(epoch.current===active)setError(message(e))}finally{setBusy('')}
  }
  const activeParams=context?.parameters.filter(p=>p.btcActivationHeight<=context.babylonBitcoinTipHeight).at(-1);
  return <section className="bitcoin-route" aria-labelledby="babylon-heading">
    <div className="bitcoin-route-copy"><p className="eyebrow">01 / Native Bitcoin</p><h2 id="babylon-heading">Babylon staking</h2><p>Your BTC is held in a Bitcoin script with a timelock. Provider misconduct can slash part of it. Rewards are separate from BTC principal.</p><span className="status-label">Signet · unsigned preparation</span><ol className="bitcoin-steps"><li className="current">Read network & prepare</li><li>Register on Babylon</li><li>Confirm BTC stake</li><li>Unbond & recover</li></ol><p className="small text-muted">This workspace covers step one. An unsigned plan is not an active stake. Registration, covenant approval and recovery still need end-to-end testnet evidence.</p><a className="text-link" href="https://btcstaking.testnet.babylonlabs.io" target="_blank" rel="noreferrer">Official Babylon test app ↗</a></div>
    <div className="bitcoin-workbench"><div className="bitcoin-workbench-head"><h3>Prepare a test stake</h3><button className="btn ghost" disabled={!!busy} onClick={inspect}>{context?'Refresh network':'Read current network'}</button></div>
      {context&&<Rows items={[["Bitcoin / Babylon height",`${context.bitcoinTipHeight.toLocaleString()} / ${context.babylonBitcoinTipHeight.toLocaleString()}`],["Minimum stake",`${btc(activeParams!.minStakingAmountSat)} test BTC`],["Committee",`${activeParams!.covenantQuorum} of ${activeParams!.covenantNoCoordPks.length}`]]}/>}
      <div className="bitcoin-wallet-line"><span>{wallet?<><span className="mono">{short(wallet.address)}</span><small>Signet payment account</small></>:<>Connect a Signet payment account<small>Public key and test inputs come from your wallet.</small></>}</span><button className="btn" onClick={connect} disabled={!!busy}>{wallet?'Reconnect':'Connect Bitcoin'}</button></div>
      <form onSubmit={e=>{e.preventDefault();void prepare()}}>
        <label className="bitcoin-field">Finality provider<select value={providerKey} disabled={!context||!!busy} onChange={e=>{clearPlan();setProviderKey(e.target.value)}}><option value="">Choose an active provider</option>{context?.finalityProviders.filter(p=>p.status==='active').map(p=><option value={p.publicKey} key={p.publicKey}>{p.name} · {(Number(p.commission)*100).toFixed(1)}% commission</option>)}</select></label>
        <div className="bitcoin-form-pair"><label className="bitcoin-field">Amount in test BTC<input inputMode="decimal" placeholder="0.00100000" value={amount} disabled={!!busy} onChange={e=>{clearPlan();setAmount(e.target.value)}}/></label><label className="bitcoin-field">Lock duration in blocks<input inputMode="numeric" value={blocks} disabled={!!busy} onChange={e=>{clearPlan();setBlocks(e.target.value)}}/></label></div>
        <details className="bitcoin-fee-details"><summary>Network fee limits</summary><div className="bitcoin-form-pair"><label className="bitcoin-field">Fee rate · sat/vB<input inputMode="decimal" value={feeRate} disabled={!!busy} onChange={e=>{clearPlan();setFeeRate(e.target.value)}}/></label><label className="bitcoin-field">Maximum fee · test BTC<input inputMode="decimal" value={maxFee} disabled={!!busy} onChange={e=>{clearPlan();setMaxFee(e.target.value)}}/></label></div></details>
        <button className="btn primary" type="submit" disabled={!wallet||!context||!providerKey||!amount||!!busy}>{busy||'Review unsigned plan'}</button>
      </form>
      {error&&<p className="bitcoin-error" role="alert">{error}</p>}
      {plan&&<div className="bitcoin-review" role="status"><p className="eyebrow">Prepared · no funds moved</p><Rows items={[["Stake",`${btc(plan.stakingSats)} test BTC`],["Network fee",`${btc(plan.feeSats)} test BTC`],["Timelock",`${plan.stakingBlocks.toLocaleString()} blocks`],["Early unbonding wait",`${plan.recovery.earlyUnbondingBlocks} blocks`],["Slashing fraction",`${plan.recovery.slashFraction*100}%`]]}/><p>Next: Babylon registration and covenant approval. This application does not sign or broadcast this plan.</p><details><summary>Review record</summary><p className="mono bitcoin-digest">{plan.reviewDigest}</p></details></div>}
    </div>
  </section>;
}
function LombardRoute(){
  const [connected,setConnected]=useState<{provider:BrowserEvmProvider;address:string}|null>(null);
  const [amount,setAmount]=useState('');const [quote,setQuote]=useState<LombardQuote|null>(null);
  const [instruction,setInstruction]=useState<LombardDepositInstruction|null>(null);
  const [accepted,setAccepted]=useState(false);const [busy,setBusy]=useState('');const [error,setError]=useState('');
  const session=useRef<LombardStakeSession|null>(null);const epoch=useRef(0);
  function reset(){epoch.current++;session.current?.dispose();session.current=null;setQuote(null);setInstruction(null);setAccepted(false);setError('')}
  useEffect(()=>()=>{epoch.current++;session.current?.dispose()},[]);
  useEffect(()=>{if(!connected)return;const changed=()=>{reset();setConnected(null);setError('Wallet account or network changed. Connect and review again.')};connected.provider.on?.('accountsChanged',changed);connected.provider.on?.('chainChanged',changed);return()=>{connected.provider.removeListener?.('accountsChanged',changed);connected.provider.removeListener?.('chainChanged',changed)}},[connected]);
  async function connect(){reset();const active=epoch.current;setBusy('Connecting…');try{const w=await connectSepolia();if(epoch.current===active)setConnected(w)}catch(e){if(epoch.current===active)setError(message(e))}finally{setBusy('')}}
  async function prepare(){reset();const active=epoch.current;setBusy('Reading Lombard quote…');try{if(!connected)throw new Error('Connect your Sepolia wallet first.');const api=await moduleApi();const s=await api.prepareLombardStake({amountBtc:amount,recipient:connected.address,expectedChainId:11155111},connected.provider);if(epoch.current!==active){s.dispose();return}session.current=s;setQuote(s.quote)}catch(e){if(epoch.current===active)setError(message(e))}finally{setBusy('')}}
  async function authorize(){if(!session.current||!quote||!accepted||!quote.authorizationReady)return;const active=epoch.current;setBusy('Verify in wallet…');setError('');try{const result=await session.current.authorizeAndGenerateDepositAddress(quote.reviewDigest);if(epoch.current===active)setInstruction(result)}catch(e){if(epoch.current===active)setError(message(e))}finally{setBusy('')}}
  return <section className="bitcoin-route" aria-labelledby="lombard-heading"><div className="bitcoin-route-copy"><p className="eyebrow">02 / External custody</p><h2 id="lombard-heading">Lombard LBTC</h2><p>Move Signet test BTC into Lombard custody and receive its test token on Sepolia. LBTC strategy and custody risks differ from a native BTC timelock.</p><span className="status-label">Signet → Sepolia · sandbox</span><ol className="bitcoin-steps"><li className="current">Review quote</li><li>Authorize deposit address</li><li>Send test BTC separately</li><li>Issue & redeem LBTC</li></ol><p className="small text-muted">Address authorization signs a fee allowance. It does not transfer BTC. Funding, issuance and a complete redemption have not been exercised by this rebuild.</p><a className="text-link" href="https://docs.lombard.finance/build/sdk/start-here/testing-and-sandbox" target="_blank" rel="noreferrer">Official sandbox guide ↗</a></div>
      <div className="bitcoin-workbench"><h3>Review a test deposit</h3><div className="bitcoin-wallet-line"><span>{connected?<><span className="mono">{short(connected.address)}</span><small>Sepolia recipient</small></>:<>Connect the receiving wallet<small>Use Sepolia. Your Stacks account is separate.</small></>}</span><button className="btn" onClick={connect} disabled={!!busy}>{connected?'Reconnect':'Connect Ethereum'}</button></div>
      <form onSubmit={e=>{e.preventDefault();void prepare()}}><label className="bitcoin-field">Amount in test BTC<input inputMode="decimal" placeholder="0.00100000" value={amount} disabled={!!busy} onChange={e=>{reset();setAmount(e.target.value)}}/></label><button className="btn primary" type="submit" disabled={!connected||!amount||!!busy}>{busy||'Get live quote'}</button></form>
      {error&&<p role="alert" className="bitcoin-error">{error}</p>}
      {quote&&<div className="bitcoin-review"><p className="eyebrow">Review before authorization</p><Rows items={[["Amount",`${quote.amountBtc} test BTC`],["Maximum minting fee",`${quote.mintingFeeBtc} test BTC`],["Estimated receipt",`${quote.estimatedLbtc} test LBTC`],["Custody",'Lombard consortium'],["Destination",'Ethereum Sepolia'],["Receipt token",quote.tokenAddress]]}/><p>Receipt is an estimate; this BTC deposit flow does not enforce a minimum token output. The fee signature can remain valid for up to 24 hours. BTC network fees are additional.</p><label className="bitcoin-consent"><input type="checkbox" checked={accepted} disabled={!!busy||!!instruction} onChange={e=>setAccepted(e.target.checked)}/><span>I understand the custody, variable receipt, and fee authorization. I will use Signet test coins only.</span></label>{quote.authorizationBlockReason&&<p role="status" className="bitcoin-error">{quote.authorizationBlockReason}</p>}{!instruction&&<button className="btn primary" disabled={!accepted||!!busy||!quote.authorizationReady} onClick={authorize}>{busy||'Authorize test deposit address'}</button>}
      {instruction&&<div className="bitcoin-address" role="status"><strong>Test deposit address verified</strong><p className="mono">{instruction.depositAddress}</p><p>Signet only. No Bitcoin transaction has been submitted. Save the recipient and return to Lombard for issuance and redemption tracking.</p><button className="btn ghost" onClick={()=>void navigator.clipboard.writeText(instruction.depositAddress).catch(()=>setError('Copy failed. Select the address above to copy it.'))}>Copy Signet address</button></div>}
      </div>}
    </div></section>;
}
export default function BitcoinRoutes(){return <div className="bitcoin-routes"><div className="notice"><div><strong>Separate Bitcoin test routes</strong><br/>These flows use their own wallets and recovery paths. They are separate from the SatoshiYield sBTC vault. No mainnet Bitcoin transactions are enabled here.</div></div><BabylonRoute/><LombardRoute/><div className="bitcoin-handoffs"><div><h3>Solv</h3><p>External BTC custody and strategy vaults. A supported public deposit-to-redemption test environment has not been verified.</p><a className="text-link" href="https://docs.solv.finance/solvbtc-technical-architecture/bitcoin-mainnet-architecture" target="_blank" rel="noreferrer">Read the official custody model ↗</a></div><div><h3>Native Stacks Bitcoin staking</h3><p>Direct BTC timelocks and pooled sBTC have different entry conditions. Check current bond eligibility in the native Bitcoin panel below.</p><a className="text-link" href="https://www.stacks.co/blog/genesis-bond-14-day-recap" target="_blank" rel="noreferrer">Read the official access details ↗</a></div></div></div>}
