// Read-only public RPC verification. Never signs, broadcasts, or reads wallet settings.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Cl, cvToHex, hexToCV, cvToJSON } from '@stacks/transactions';
const expected=JSON.parse(fs.readFileSync('reports/hermetica-v7/upstream-binding.json','utf8'));
const api=expected.provider;
async function json(url,init) {
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw Error(`${r.status} ${url}`);
  return r.json();
}
const info=await json(`${api}/v2/info`);
if(info.network_id!==1 || !Number.isSafeInteger(info.stacks_tip_height)) throw Error('Wrong chain or invalid height');
const block=await json(`${api}/extended/v1/block/by_height/${info.stacks_tip_height}`);
if(!block.canonical || block.height!==info.stacks_tip_height || block.hash?.replace(/^0x/,'')!==info.stacks_tip || !/^0x[0-9a-fA-F]{64}$/.test(block.index_block_hash)) throw Error('Noncanonical or inconsistent chain tip');
const sourceChecks=[];
for(const [name,source] of Object.entries(expected.sources)) {
  const actual=await json(source.sourceUrl);
  const sha256=crypto.createHash('sha256').update(actual.source).digest('hex');
  if(sha256!==source.sha256) throw Error(`Source mismatch: ${name}`);
  sourceChecks.push({name,sha256,publishHeight:actual.publish_height});
}
const readings=[];
async function read(contract,fn,args=[]) {
  const result=await json(`${api}/v2/contracts/call-read/${expected.deployer}/${contract}/${fn}?tip=${block.index_block_hash}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sender:expected.deployer,arguments:args.map(cvToHex)})});
  if(!result.okay) throw Error(`${contract}.${fn}: ${result.cause}`);
  const value=cvToJSON(hexToCV(result.result));readings.push({contract,fn,arguments:args.map(cvToJSON),value,okay:true});return value.value;
}
const governor=await read('hq-v1','get-owner');
const enabled=await read('hq-v1','get-protocol',[Cl.principal(expected.upstream)]);
const globalEnabled=await read('hq-v1','get-protocol-enabled');
for(const name of ['vault-hbtc-v1','vault-hbtc-v1-1','vault-hbtc-v1-3','vault-hbtc-v1-4']) await read('hq-v1','get-protocol',[Cl.principal(`${expected.deployer}.${name}`)]);
for(const fn of ['get-deposit-enabled','get-vault-enabled','get-redeem-enabled','get-request-redeem-enabled','get-cooldown','get-share-price','get-net-assets','get-deposit-cap','get-min-deposit','get-min-redeem','get-fees']) await read('state-hbtc-v1',fn);
const governanceMatches=governor===expected.expectedGovernor && enabled===true;
const depositEnabled=readings.find(x=>x.fn==='get-deposit-enabled').value.value;
const report={fetchedAt:new Date().toISOString(),info,block,sourceChecks,readings,governanceMatches,upstreamAdmissionEnabled:governanceMatches&&globalEnabled&&depositEnabled};
if(process.argv.includes('--write')) fs.writeFileSync('reports/hermetica-v7/mainnet-snapshot.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({blockHeight:block.height,indexBlockHash:block.index_block_hash,sourceChecks:sourceChecks.length,governanceMatches,upstreamDepositEnabled:depositEnabled,upstreamAdmissionEnabled:report.upstreamAdmissionEnabled},null,2));
if(!governanceMatches) throw Error('Pinned governance/version changed: deposits must remain blocked and require new review');
