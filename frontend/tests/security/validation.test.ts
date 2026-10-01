import {describe,it,expect,vi,afterEach} from 'vitest';
import {Cl,cvToHex} from '@stacks/transactions';
import {parseSbtcAmount,formatSbtcAmount,MAX_UINT128} from '../../src/lib/amount.js';
import {decodeClarity,requireUint,safeNumber} from '../../src/lib/chainRead.js';
import {parsePosition} from '../../src/hooks/usePositions.js';
import {validateYield,MAX_YIELD_AGE_MS} from '../../src/hooks/useYields.js';
import {fetchVaultStats} from '../../src/hooks/useVaultStats.js';
import {depositOptions} from '../../src/lib/transactionPolicy.js';
vi.mock('../../src/context/WalletContext.js',()=>({useWallet:()=>({address:null})}));
const now=Date.now();
const valid={protocol:'zest',apy_percent:2,risk_level:'medium',lock_period_days:0,reward_token:'sBTC',tvl_usd:100,fetched_at:now,last_updated_block:100,apy_stale:false,is_live_integration:true};
afterEach(()=>vi.unstubAllGlobals());
describe('exact asset amount parsing',()=>{
  it.each(['1e8','1e309','Infinity','NaN','-1','0','0.000000001',' 1','1 ','1,000','+1','01','1.'])('rejects %s',value=>expect(()=>parseSbtcAmount(value)).toThrow());
  it('preserves all 8 decimal places',()=>expect(parseSbtcAmount('12345678.12345678')).toBe(1234567812345678n));
  it('accepts uint128 boundary, rejects the next unit',()=>{expect(parseSbtcAmount(formatSbtcAmount(MAX_UINT128))).toBe(MAX_UINT128);expect(()=>parseSbtcAmount(formatSbtcAmount(MAX_UINT128+1n))).toThrow();});
  it('round trips 2000 deterministic randomly generated integer amounts',()=>{
    let seed=0x123456789n;
    for(let i=0;i<2000;i++){seed=(seed*6364136223846793005n+1442695040888963407n)&MAX_UINT128;const amount=seed||1n;expect(parseSbtcAmount(formatSbtcAmount(amount))).toBe(amount);}
  });
});
describe('fail-closed chain and feed data',()=>{
  it('decodes exact uints and rejects wrong types/errors/trailing bytes',()=>{
    expect(requireUint(decodeClarity(cvToHex(Cl.ok(Cl.uint(123)))))).toBe(123n);
    expect(()=>decodeClarity(cvToHex(Cl.err(Cl.uint(1))))).toThrow();
    expect(()=>requireUint(decodeClarity(cvToHex(Cl.int(1))))).toThrow();
    expect(()=>decodeClarity(cvToHex(Cl.uint(1))+'00')).toThrow();
    expect(()=>safeNumber(BigInt(Number.MAX_SAFE_INTEGER)+1n)).toThrow();
  });
  it('never treats missing stale metadata as fresh',()=>{
    expect(validateYield({...valid,apy_stale:undefined},now)?.apy_stale).toBe(true);
    expect(validateYield({...valid,last_updated_block:undefined},now)?.apy_stale).toBe(true);
    expect(validateYield({...valid,fetched_at:now-MAX_YIELD_AGE_MS-1},now)?.apy_stale).toBe(true);
    expect(validateYield(valid,now)?.is_live_integration).toBe(false);
  });
  it.each([{fetched_at:now+100000},{tvl_usd:-1},{tvl_usd:Infinity},{lock_period_days:NaN},{protocol:'__proto__'},{reward_token:'STX'},{apy_percent:Infinity}])('rejects malformed fields %j',patch=>expect(validateYield({...valid,...patch},now)).toBeNull());
  it('preserves negative APY instead of presenting it as zero profit',()=>expect(validateYield({...valid,apy_percent:-10},now)?.apy_percent).toBe(-10));
  it('reports a failed chain read instead of fabricated totals or fees',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async ()=>new Response(JSON.stringify({okay:false,cause:'unknown contract'}),{status:200})));
    await expect(fetchVaultStats()).rejects.toThrow('unavailable');
  });
  it('does not mislabel an unknown adapter as Zest',()=>{
    const unknown='SP000000000000000000002Q6VF78.unrecognized';
    const value=Cl.some(Cl.tuple({adapter:Cl.contractPrincipal('SP000000000000000000002Q6VF78','unrecognized'),'principal-amount':Cl.uint(1000),'deposited-at':Cl.uint(1),'is-async':Cl.bool(false),status:Cl.uint(0),'claim-id':Cl.uint(0)}));
    const parsed=parsePosition(value);expect(parsed?.protocol).toBeNull();expect(parsed?.adapter).toBe(unknown);
  });
  it('rejects mainnet deposits before network reads or signing',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(depositOptions('SP000000000000000000002Q6VF78','zest',1000n,500)).rejects.toThrow('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });
});
