import { Cl, ClarityType, Pc, PostConditionMode, cvToHex, hexToCV, validateStacksAddress } from '@stacks/transactions';
import manifest from '../manifests/mainnet.json' with { type: 'json' };
import guardManifest from '../manifests/queue-guard.json' with { type: 'json' };

export const MAINNET_CHAIN_ID = 1;
export const QUOTE_TTL_MS = 60_000;
export const MAX_UINT128 = (1n << 128n) - 1n;
const Z = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7';
const S = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG';
export const CONTRACTS = Object.freeze({
  sbtc: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  sbtcRegistry: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry',
  zest: `${Z}.v0-vault-sbtc`, zestRegistry: `${Z}.v0-assets`,
  stackingCore: `${S}.stacking-dao-core-stbtc-v1`, stbtc: `${S}.stbtc-token`,
  reserve: `${S}.stbtc-reserve`, ratio: `${S}.data-stbtc-v1`, dao: `${S}.dao`,
  rewards: `${S}.rewards-pox5-v1`, withdrawals: `${S}.withdraw-data-stbtc`, nft: `${S}.stbtc-withdraw-nft`,
  ststxbtc: `${S}.ststxbtc-token`, ststxbtcV2: `${S}.ststxbtc-token-v2`,
});
export const PROTOCOLS = Object.freeze({
  'zest-sbtc': Object.freeze({ name: 'Zest sBTC lending', asset: 'sBTC', receipt: 'zsBTC', contract: CONTRACTS.zest, receiptContract: CONTRACTS.zest, receiptAssetName: 'zft', custody: CONTRACTS.zest, chainId: 1, network: 'mainnet', testnet: null }),
  'stackingdao-stbtc': Object.freeze({ name: 'StackingDAO stBTC', asset: 'sBTC', receipt: 'stBTC', contract: CONTRACTS.stackingCore, receiptContract: CONTRACTS.stbtc, receiptAssetName: 'stbtc', custody: CONTRACTS.reserve, chainId: 1, network: 'mainnet', testnet: null }),
});
const fail = message => { throw new Error(message); };
const check = (test, message) => { if (!test) fail(message); };
export function uint(value, name = 'amount', allowZero = false) {
  check(typeof value === 'bigint' || (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)), `${name} must be an exact bigint or canonical integer string`);
  const n = BigInt(value);
  check(n >= (allowZero ? 0n : 1n) && n <= MAX_UINT128, `${name} is outside uint128 bounds`);
  return n;
}
export function walletPrincipal(value) {
  check(typeof value === 'string' && /^(SP|SM)/.test(value) && !value.includes('.') && validateStacksAddress(value), 'A mainnet wallet principal is required');
  return value;
}
export function decode(cv) {
  switch (cv.type) {
    case ClarityType.UInt: return cv.value;
    case ClarityType.BoolTrue: return true;
    case ClarityType.BoolFalse: return false;
    case ClarityType.PrincipalStandard:
    case ClarityType.PrincipalContract:
    case ClarityType.StringASCII:
    case ClarityType.StringUTF8: return cv.value;
    case ClarityType.OptionalNone: return null;
    case ClarityType.OptionalSome:
    case ClarityType.ResponseOk: return decode(cv.value);
    case ClarityType.ResponseErr: fail(`Contract returned error ${String(decode(cv.value))}`); break;
    case ClarityType.Tuple: return Object.fromEntries(Object.entries(cv.value).map(([k,v])=>[k,decode(v)]));
    case ClarityType.Buffer: return cv.value;
    default: fail(`Unsupported Clarity result type ${cv.type}`);
  }
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const ceilDiv = (n,d) => (n + d - 1n) / d;
export function minimumOutput(expected, slippageBps = 50) {
  const n = uint(expected, 'expected output');
  check(Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps <= 1000, 'Slippage must be 0–1000 basis points');
  const minimum = n * BigInt(10000 - slippageBps) / 10000n;
  check(minimum > 0n, 'Minimum output would round to zero');
  return minimum;
}
export function stackingRates(state) {
  const numeric = ['supply','pendingShares','totalBacking','reserved','readyRewards','rewardBalance','ststxbtcBps','ststxBps','legacySupply','newSupply','ratioDown','ratioUp'];
  for (const key of numeric) uint(state[key], key, true);
  check(state.pendingShares <= state.supply && state.totalBacking >= state.reserved, 'Invalid StackingDAO backing or pending shares');
  check(state.ststxbtcBps + state.ststxBps <= 10000n && state.readyRewards <= state.rewardBalance, 'Invalid reward stream');
  check(state.keeper !== CONTRACTS.stackingCore, 'Core has unexpected reward-keeper authority');
  const activeSupply = state.supply - state.pendingShares;
  const activeBacking = state.totalBacking - state.reserved;
  const down = activeSupply === 0n ? 100000000n : activeBacking * 100000000n / activeSupply;
  const up = activeSupply === 0n ? 100000000n : ceilDiv(activeBacking * 100000000n, activeSupply);
  check(state.ratioDown === down && state.ratioUp === up, 'Ratio reads do not reconcile with backing');
  const btcShare = state.readyRewards * state.ststxbtcBps / 10000n;
  const stxShare = state.readyRewards * state.ststxBps / 10000n;
  const pendingReserveRewards = state.readyRewards - btcShare - stxShare
    + (state.legacySupply + state.newSupply === 0n ? btcShare : 0n)
    + (state.stxRecipient === null || state.stxRecipient === CONTRACTS.reserve ? stxShare : 0n);
  const backingAfterRewards = activeBacking + pendingReserveRewards;
  return {
    pendingReserveRewards,
    down: activeSupply === 0n ? 100000000n : backingAfterRewards * 100000000n / activeSupply,
    up: activeSupply === 0n ? 100000000n : ceilDiv(backingAfterRewards * 100000000n, activeSupply),
  };
}
async function sha256(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), n=>n.toString(16).padStart(2,'0')).join('');
}
const same = (a,b) => a === b;

/** No wallet connection, keys, signing, approvals, or broadcast methods exist here. */
export function createStacksIntegrationClient({ fetch: fetcher = globalThis.fetch, now = Date.now, endpoint = 'https://api.hiro.so', queueGuard = null } = {}) {
  const url = new URL(endpoint);
  check(url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/', 'Use an HTTPS Stacks node origin');
  const origin = url.origin;
  const observations = new WeakSet();
  const quotes = new WeakSet();
  const verifiedAt = new Map();
  if(queueGuard!==null) {
    const [address,name,...extra]=queueGuard.split('.');
    walletPrincipal(address);check(extra.length===0&&/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(name),'Invalid queue guard contract');
  }
  async function json(path, init) {
    const response = await fetcher(origin + path,{ ...init, signal: AbortSignal.timeout(15000) });
    check(response.ok, `Stacks RPC HTTP ${response.status} at ${path.split('?')[0]}`);
    return response.json();
  }
  async function network() {
    const info = await json('/v2/info');
    check(info.network_id === MAINNET_CHAIN_ID, 'Stacks RPC chain ID mismatch');
    check(Number.isSafeInteger(info.stacks_tip_height) && Number.isSafeInteger(info.burn_block_height) && /^[a-fA-F0-9]{64}$/.test(info.stacks_tip), 'Invalid canonical chain tip');
    const block=await json(`/extended/v2/blocks/${info.stacks_tip_height}`);
    check(block.canonical===true&&block.height===info.stacks_tip_height&&block.hash?.replace(/^0x/,'')===info.stacks_tip,'Canonical block lookup does not match node tip');
    check(/^0x[0-9a-fA-F]{64}$/.test(block.index_block_hash),'Invalid canonical index block hash');
    return {...info,read_tip:block.index_block_hash};
  }
  async function sourceVerification(protocol,claimOnly=false) {
    const key = protocol === 'zest-sbtc' ? 'zest' : 'stackingdao';
    const claimContracts=[CONTRACTS.sbtc,CONTRACTS.sbtcRegistry,CONTRACTS.stackingCore,CONTRACTS.dao,CONTRACTS.reserve,CONTRACTS.stbtc,CONTRACTS.nft,CONTRACTS.withdrawals,CONTRACTS.ratio];
    const records = manifest.contracts.filter(c=>claimOnly?claimContracts.includes(c.contract):c.protocol===key || c.protocol==='sbtc');
    if(key==='stackingdao'&&queueGuard&&!claimOnly) records.push({contract:queueGuard,sha256:guardManifest.sha256});
    for (const record of records) {
      const prior = verifiedAt.get(record.contract);
      if (prior !== undefined && now() >= prior && now() - prior < 300000) continue;
      const [address,name] = record.contract.split('.');
      const data = await json(`/v2/contracts/source/${address}/${name}?proof=0`);
      check(typeof data.source === 'string' && await sha256(data.source) === record.sha256, `Source mismatch for ${record.contract}`);
      verifiedAt.set(record.contract,now());
    }
    return records.map(({contract,sha256})=>({contract,sha256}));
  }
  async function read(contract,fn,args,tip,sender) {
    const [address,name] = contract.split('.');
    const result = await json(`/v2/contracts/call-read/${address}/${name}/${fn}?tip=${tip}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sender,arguments:args.map(cvToHex)})});
    check(result.okay === true && typeof result.result === 'string' && /^0x(?:[0-9a-fA-F]{2})+$/.test(result.result), `Read failed or malformed: ${name}.${fn}`);
    const cv=hexToCV(result.result);
    check(cvToHex(cv).toLowerCase()===result.result.toLowerCase(),`Noncanonical Clarity encoding: ${name}.${fn}`);
    return decode(cv);
  }
  async function readState(protocol, owner,claimOnly=false) {
    check(Object.hasOwn(PROTOCOLS,protocol),'Unsupported Stacks protocol');
    walletPrincipal(owner);
    const observedAt=now();
    const info = await network();
    const sources = await sourceVerification(protocol,claimOnly);
    const query = (contract,fn,args=[])=>read(contract,fn,args,info.read_tip,owner);
    const fields = [
      ['assetBalance',CONTRACTS.sbtc,'get-balance-available',[Cl.principal(owner)]],
      ['receiptBalance',PROTOCOLS[protocol].receiptContract,'get-balance',[Cl.principal(owner)]],
    ];
    if(protocol==='zest-sbtc') fields.push(
      ['paused',CONTRACTS.zest,'get-pause-states'],['cap',CONTRACTS.zest,'get-cap-supply'],
      ['assets',CONTRACTS.zest,'get-total-assets'],['liquidity',CONTRACTS.zest,'get-available-assets'],
      ['underlying',CONTRACTS.zest,'get-underlying'],['registry',CONTRACTS.zestRegistry,'get-asset-status',[Cl.principal(CONTRACTS.zest)]],
    );
    else if(claimOnly) fields.push(
      ['enabled',CONTRACTS.dao,'get-contracts-enabled'],['coreActive',CONTRACTS.dao,'get-contract-active',[Cl.principal(CONTRACTS.stackingCore)]],
      ['claimPaused',CONTRACTS.stackingCore,'get-shutdown-withdraw'],['reserved',CONTRACTS.reserve,'get-sbtc-for-withdrawals'],['liquidBalance',CONTRACTS.reserve,'get-sbtc-balance'],
    );
    else fields.push(
      ['enabled',CONTRACTS.dao,'get-contracts-enabled'],['coreActive',CONTRACTS.dao,'get-contract-active',[Cl.principal(CONTRACTS.stackingCore)]],
      ['depositPaused',CONTRACTS.stackingCore,'get-shutdown-deposits'],['requestPaused',CONTRACTS.stackingCore,'get-shutdown-init-withdraw'],
      ['claimPaused',CONTRACTS.stackingCore,'get-shutdown-withdraw'],['idlePaused',CONTRACTS.stackingCore,'get-shutdown-withdraw-idle'],
      ['withdrawFee',CONTRACTS.stackingCore,'get-withdraw-fee'],['idleFee',CONTRACTS.stackingCore,'get-withdraw-idle-fee'],['feeExempt',CONTRACTS.stackingCore,'is-fee-exempt',[Cl.principal(owner)]],
      ['supply',CONTRACTS.stbtc,'get-total-supply'],['pendingShares',CONTRACTS.ratio,'get-pending-shares'],
      ['totalBacking',CONTRACTS.reserve,'get-total-sbtc'],['reserved',CONTRACTS.reserve,'get-sbtc-for-withdrawals'],['liquidBalance',CONTRACTS.reserve,'get-sbtc-balance'],
      ['ratioDown',CONTRACTS.ratio,'get-sbtc-per-stbtc'],['ratioUp',CONTRACTS.ratio,'get-sbtc-per-stbtc-up'],
      ['readyRewards',CONTRACTS.rewards,'get-ready-to-release'],['rewardBalance',CONTRACTS.rewards,'get-sbtc-balance'],
      ['ststxbtcBps',CONTRACTS.rewards,'get-ststxbtc-bps'],['ststxBps',CONTRACTS.rewards,'get-ststx-bps'],
      ['stxRecipient',CONTRACTS.rewards,'get-stx-reward-recipient'],['keeper',CONTRACTS.rewards,'get-keeper'],
      ['legacySupply',CONTRACTS.ststxbtc,'get-total-supply'],['newSupply',CONTRACTS.ststxbtcV2,'get-total-supply'],
      ['cooldown',CONTRACTS.withdrawals,'get-withdraw-cooldown-blocks'],
    );
    // Bounded concurrency prevents browser bursts from overwhelming public RPCs.
    const values = {};
    for(let i=0;i<fields.length;i+=4) await Promise.all(fields.slice(i,i+4).map(async([key,c,f,args=[]])=>{values[key]=await query(c,f,args);}));
    for(const [key,value] of Object.entries(values)) if(!['paused','registry','underlying','stxRecipient','keeper','enabled','coreActive','claimPaused','depositPaused','requestPaused','idlePaused','feeExempt'].includes(key)) check(typeof value==='bigint',`Invalid on-chain uint: ${key}`);
    uint(values.assetBalance,'asset balance',true); uint(values.receiptBalance,'receipt balance',true);
    if(protocol==='zest-sbtc') {
      check(values.underlying===CONTRACTS.sbtc,'Zest underlying mismatch');
      check(values.registry && values.registry.addr === CONTRACTS.zest,'Zest registry does not select the pinned sBTC vault');
      for(const k of ['deposit','redeem','accrue']) check(typeof values.paused?.[k]==='boolean','Invalid Zest pause state');
      for(const k of ['cap','assets','liquidity']) uint(values[k],k,true);
    } else if(claimOnly) {
      for(const k of ['enabled','coreActive','claimPaused']) check(typeof values[k]==='boolean',`Invalid ${k}`);
      for(const k of ['reserved','liquidBalance']) uint(values[k],k,true);
    } else {
      for(const k of ['enabled','coreActive','depositPaused','requestPaused','claimPaused','idlePaused','feeExempt']) check(typeof values[k]==='boolean',`Invalid ${k}`);
      for(const k of ['withdrawFee','idleFee']) check(uint(values[k],k,true)<10000n,'Invalid withdrawal fee');
      for(const k of ['liquidBalance','cooldown']) uint(values[k],k,true);
      values.rates = stackingRates(values);
    }
    check(now()-observedAt<=QUOTE_TTL_MS,'Observation took too long; retry');
    const state = freeze({protocol,owner,network:'mainnet',chainId:1,observedAt,tip:info.read_tip,stacksHeight:info.stacks_tip_height,burnHeight:info.burn_block_height,sources,queueGuard,claimOnly,...values,allowance:{required:false,type:'none',reason:'SIP-010 direct calls use caller authority; there is no ERC-20 approval transaction.'}});
    observations.add(state);
    return state;
  }
  function fresh(state) {
    check(observations.has(state),'Use an observation produced by this client');
    check(now()>=state.observedAt && now()-state.observedAt<=QUOTE_TTL_MS,'Observation expired; refresh before review');
  }
  async function quote(state, action, amount, {slippageBps=50}={}) {
    fresh(state);
    check(!state.claimOnly,'Claim observation cannot authorize a new position or withdrawal request');
    const n=uint(amount); const p=state.protocol;
    check(['deposit','redeem','request'].includes(action),'Unsupported action');
    let expected,fee=0n,executable=true,reason=null;
    if(action==='deposit') check(state.assetBalance>=n,'Insufficient available sBTC balance');
    else check(state.receiptBalance>=n,'Insufficient receipt balance');
    if(p==='zest-sbtc') {
      check(action!=='request','Zest lending uses synchronous redemption');
      check(!state.paused[action==='deposit'?'deposit':'redeem']&&!state.paused.accrue,'Zest operation is paused');
      expected=await read(CONTRACTS.zest,action==='deposit'?'convert-to-shares':'convert-to-assets',[Cl.uint(n)],state.tip,state.owner);
      check(typeof expected==='bigint','Invalid on-chain quote uint');
      if(action==='deposit') check(state.assets+n<=state.cap,'Zest supply cap exceeded');
      else check(state.liquidity>=expected,'Zest available liquidity is insufficient');
    } else {
      check(state.enabled&&state.coreActive,'StackingDAO registry disables this core');
      if(action==='deposit') {
        check(!state.depositPaused,'StackingDAO deposits paused');
        if(state.supply===0n) {check(n>1000n,'Initial deposit must exceed dead shares'); expected=n-1000n;}
        else {check(state.rates.up>0n,'Invalid deposit ratio');expected=n*100000000n/state.rates.up;}
      } else {
        check(!(action==='request'?state.requestPaused:state.idlePaused),'StackingDAO withdrawal path paused');
        const gross=n*state.rates.down/100000000n;
        const bps=action==='request'?state.withdrawFee:state.feeExempt?0n:state.idleFee;
        fee=gross*bps/10000n; expected=gross-fee;
        if(action==='redeem') check(state.liquidBalance+state.rates.pendingReserveRewards>=state.reserved+expected,'Insufficient idle sBTC; queued withdrawal required');
        else if(!queueGuard) {executable=false;reason='The published init-withdraw ABI has no minimum entitlement or maximum fee parameter. The atomic guard is not deployed/configured.';}
      }
    }
    const q=freeze({protocol:p,action,owner:state.owner,amount:n,expectedOut:uint(expected,'quoted output'),minimumOut:minimumOutput(expected,slippageBps),slippageBps,fee,maxFeeBps:p==='stackingdao-stbtc'?state.withdrawFee:null,maxCooldownBurnBlocks:action==='request'?uint(state.cooldown,'cooldown'):null,observedAt:state.observedAt,expiresAt:state.observedAt+QUOTE_TTL_MS,tip:state.tip,chainId:1,network:'mainnet',executable,reason,state});
    quotes.add(q); return q;
  }
  async function readClaim(state,id) {
    fresh(state);check(state.protocol==='stackingdao-stbtc','Only StackingDAO uses NFT withdrawal claims');
    const claimId=uint(id,'claim ID');
    const [owner,entry]=await Promise.all([
      read(CONTRACTS.nft,'get-owner',[Cl.uint(claimId)],state.tip,state.owner),
      read(CONTRACTS.withdrawals,'get-withdrawals-by-nft',[Cl.uint(claimId)],state.tip,state.owner),
    ]);
    check(owner===state.owner,'Withdrawal NFT is absent or belongs to another wallet');
    for(const key of ['asset-amount','token-amount','withdraw-fee','unlock-burn-height']) check(typeof entry[key]==='bigint',`Invalid claim uint: ${key}`);
    const gross=uint(entry['asset-amount'],'claim assets'); const shares=uint(entry['token-amount'],'claim shares');
    const bps=uint(entry['withdraw-fee'],'claim fee',true);check(bps<10000n,'Invalid claim fee');
    const unlockBurnHeight=uint(entry['unlock-burn-height'],'unlock burn height');
    check(gross<=MAX_UINT128/(bps||1n),'Claim fee arithmetic overflows uint128');
    const fee=gross*bps/10000n;const expectedOut=uint(gross-fee,'claim net payout');
    const unlocked=BigInt(state.burnHeight)>=unlockBurnHeight;
    const executable=state.enabled&&state.coreActive&&!state.claimPaused&&unlocked&&state.liquidBalance>=expectedOut&&state.reserved>=expectedOut;
    const q=freeze({protocol:state.protocol,action:'claim',owner,claimId,amount:shares,expectedOut,minimumOut:expectedOut,fee,unlockBurnHeight,observedAt:state.observedAt,expiresAt:state.observedAt+QUOTE_TTL_MS,tip:state.tip,chainId:1,network:'mainnet',executable,reason:executable?null:'Claim is paused, locked, or not liquid.',state});
    quotes.add(q); return q;
  }
  function buildUnsignedRoute(q,{walletAddress,network:walletNetwork}={}) {
    check(quotes.has(q),'Use a quote produced by this client');fresh(q.state);
    check(same(walletPrincipal(walletAddress),q.owner)&&walletNetwork==='mainnet','Wallet/network changed since quote');
    check(q.executable,q.reason ?? 'Route is not executable');
    const rules=[{asset:'STX',principal:q.owner,condition:'eq',amount:0n}];
    const ft=(principal,contract,assetName,condition,amount)=>rules.push({asset:`${contract}::${assetName}`,principal,condition,amount});
    ft(q.owner,CONTRACTS.sbtc,'sbtc-token','eq',q.action==='deposit'?q.amount:0n);
    const p=PROTOCOLS[q.protocol];
    let functionName,functionArgs;
    if(q.protocol==='zest-sbtc') {
      functionName=q.action==='deposit'?'deposit':'redeem';
      functionArgs=[Cl.uint(q.amount),Cl.uint(q.minimumOut),Cl.principal(q.owner)];
      ft(q.owner,CONTRACTS.zest,'zft','eq',q.action==='deposit'?0n:q.amount);
      if(q.action==='redeem') ft(CONTRACTS.zest,CONTRACTS.sbtc,'sbtc-token','gte',q.minimumOut);
    } else {
      if(q.action==='deposit') {functionName='deposit';functionArgs=[Cl.uint(q.amount),Cl.uint(q.minimumOut)];ft(q.owner,CONTRACTS.stbtc,'stbtc','eq',0n);}
      else if(q.action==='redeem') {functionName='withdraw-idle';functionArgs=[Cl.uint(q.amount)];ft(q.owner,CONTRACTS.stbtc,'stbtc','eq',q.amount);ft(CONTRACTS.reserve,CONTRACTS.sbtc,'sbtc-token','gte',q.minimumOut);}
      else if(q.action==='request') {functionName='request';functionArgs=[Cl.uint(q.amount),Cl.uint(q.minimumOut),Cl.uint(q.maxFeeBps),Cl.uint(q.maxCooldownBurnBlocks)];ft(q.owner,CONTRACTS.stbtc,'stbtc','eq',q.amount);}
      else {functionName='withdraw';functionArgs=[Cl.uint(q.claimId)];ft(q.owner,CONTRACTS.stbtc,'stbtc','eq',0n);ft(CONTRACTS.stackingCore,CONTRACTS.stbtc,'stbtc','eq',q.amount);ft(CONTRACTS.reserve,CONTRACTS.sbtc,'sbtc-token','eq',q.expectedOut);rules.push({asset:`${CONTRACTS.nft}::withdraw-nft`,principal:q.owner,condition:'sent',tokenId:q.claimId});}
      // Public core calls only the stream release branch, not keeper reconfiguration.
      if(q.action!=='claim') ft(CONTRACTS.rewards,CONTRACTS.sbtc,'sbtc-token','lte',q.state.rewardBalance);
    }
    const postConditions=rules.map(r=>r.asset==='STX'?Pc.principal(r.principal).willSendEq(r.amount).ustx():r.condition==='sent'?Pc.principal(r.principal).willSendAsset().nft(r.asset,Cl.uint(r.tokenId)):(r.condition==='eq'?Pc.principal(r.principal).willSendEq(r.amount):r.condition==='gte'?Pc.principal(r.principal).willSendGte(r.amount):Pc.principal(r.principal).willSendLte(r.amount)).ft(...r.asset.split('::')));
    const [contractAddress,contractName]=(q.action==='request'?queueGuard:p.contract).split('.');
    return freeze({protocol:q.protocol,action:q.action,custody:'receipt-direct-to-wallet',receiptOwner:q.owner,minimumOut:q.minimumOut,expiresAt:q.expiresAt,tip:q.tip,chainId:1,network:'mainnet',approvalRequired:false,rules,transaction:{contractAddress,contractName,functionName,functionArgs,postConditionMode:PostConditionMode.Deny,postConditions,network:'mainnet'},review:{input:q.amount,output:q.expectedOut,minimum:q.minimumOut,fee:q.fee,feeAsset:'sBTC',networkFeeIncluded:false,sourcePins:q.state.sources}});
  }
  return Object.freeze({readState,readClaimState:owner=>readState('stackingdao-stbtc',owner,true),quote,readClaim,buildUnsignedRoute});
}

/** Independent event-level deny-policy check for fork evidence; not consensus execution. */
export function assertEventPolicy(route,events) {
  const totals=new Map();const nft=new Set();
  for(const e of events) {
    const d=e.data;
    if(e.event==='ft_transfer_event'||e.event==='ft_burn_event') {
      const key=`${d.sender}|${d.asset_identifier}`;totals.set(key,(totals.get(key)??0n)+BigInt(d.amount));
    } else if(e.event==='stx_transfer_event'||e.event==='stx_burn_event') {
      const key=`${d.sender}|STX`;totals.set(key,(totals.get(key)??0n)+BigInt(d.amount));
    } else if(e.event==='nft_transfer_event'||e.event==='nft_burn_event') {
      const tokenId=decode(hexToCV(d.raw_value));nft.add(`${d.sender}|${d.asset_identifier}|${tokenId}`);
    }
  }
  const allowed=new Set(route.rules.filter(r=>r.condition!=='sent').map(r=>`${r.principal}|${r.asset}`));
  for(const key of totals.keys()) check(allowed.has(key),`Unlisted outgoing asset: ${key}`);
  for(const r of route.rules) {
    if(r.condition==='sent') {check(nft.delete(`${r.principal}|${r.asset}|${r.tokenId}`),'Expected NFT burn/transfer missing');continue;}
    const actual=totals.get(`${r.principal}|${r.asset}`)??0n;
    check(r.condition==='eq'?actual===r.amount:r.condition==='gte'?actual>=r.amount:actual<=r.amount,`Outgoing ${r.asset} violates ${r.condition} guard for ${r.principal}`);
  }
  check(nft.size===0,'Unlisted NFT movement');return true;
}
