import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Cl} from '@stacks/transactions';
const mocks=vi.hoisted(()=>({read:vi.fn(),positions:vi.fn(),admission:vi.fn()}));
const address='ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX';
vi.mock('../../src/constants/contracts.js',()=>({CONTRACTS:{VAULT:'ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.vault-v7',SBTC_TOKEN:'ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.mock-sbtc',ADAPTERS:{zest:'ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.mock-sync-v7',hbtc:'ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.mock-async-v7'}},DEPOSITS_ENABLED:true,DEPOSIT_BLOCK_REASON:'blocked',VAULT_VERSION:'v7',SBTC_ASSET_NAME:'mock-sbtc'}));
vi.mock('../../src/lib/chainRead.js',()=>({readContract:mocks.read,requireUint:(v:{value:bigint})=>BigInt(v.value)}));
vi.mock('../../src/hooks/usePositions.js',()=>({fetchPositions:mocks.positions}));
vi.mock('../../src/lib/depositAdmission.js',()=>({fetchDepositAdmission:mocks.admission}));
import {depositOptions,withdrawalOptions,getWithdrawalQuote} from '../../src/lib/transactionPolicy.js';
const adapter=address+'.mock-sync-v7';
beforeEach(()=>{vi.clearAllMocks();mocks.admission.mockResolvedValue({available:true,remainingSats:1000000n});mocks.read.mockImplementation(async (_contract:string,fn:string)=>Cl.uint(fn==='get-fee-basis-points'?500:100000));mocks.positions.mockResolvedValue([{adapter,principalSats:90000n,isAsync:false,status:'active',feeBps:500}]);});
describe('wallet transaction guardrails',()=>{
  it('uses deny mode, exact mock asset/amount, minimum shares and max fee for test deposits',async()=>{
    const options=await depositOptions(address,'zest',100000n,500);
    expect(options.postConditionMode).toBe('deny');
    expect(options.functionArgs.slice(-3)).toEqual([Cl.uint(100000),Cl.uint(99500),Cl.uint(500)]);
    expect(options.postConditions).toEqual(expect.arrayContaining([expect.objectContaining({amount:'100000',asset:address+'.mock-sbtc::mock-sbtc',condition:'eq'})]));
  });
  it('binds the maximum fee to the user review, not a newer live quote',async()=>{
    await expect(depositOptions(address,'zest',100000n,400)).rejects.toThrow('fee increased');
    await expect(depositOptions(address,'zest',100000n,NaN)).rejects.toThrow('Review');
  });
  it('rejects unsupported amounts before reading quotes',async()=>{await expect(depositOptions(address,'zest',999n,500)).rejects.toThrow();expect(mocks.read).not.toHaveBeenCalled();});
  it('blocks signing if the live adapter is paused or its capacity has decreased',async()=>{
    mocks.admission.mockResolvedValueOnce({available:false,reason:'Vault paused',remainingSats:0n});
    await expect(depositOptions(address,'zest',100000n,500)).rejects.toThrow('paused');
    mocks.admission.mockResolvedValueOnce({available:true,remainingSats:99999n});
    await expect(depositOptions(address,'zest',100000n,500)).rejects.toThrow('capacity');
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not open a wallet with an unavailable quote',async()=>{mocks.read.mockRejectedValue(new Error('RPC outage'));await expect(depositOptions(address,'zest',100000n,500)).rejects.toThrow('RPC outage');});
  it('protects sync exit minimum after the fee and bounds both transfer legs',async()=>{
    const options=await withdrawalOptions(address,adapter,'withdraw');
    expect(options.postConditionMode).toBe('deny');expect(options.functionArgs.at(-1)).toEqual(Cl.uint(99003));
    expect(options.postConditions).toHaveLength(4);
  });
  it('preserves the reviewed minimum and refuses a lower new payout',async()=>{
    expect(await getWithdrawalQuote(address,adapter)).toEqual({grossSats:100000n,payoutSats:99500n,minimumSats:99003n,feeBps:500});
    const options=await withdrawalOptions(address,adapter,'withdraw',99003n);
    expect(options.functionArgs.at(-1)).toEqual(Cl.uint(99003));
    mocks.read.mockResolvedValue(Cl.uint(98000));
    await expect(withdrawalOptions(address,adapter,'withdraw',99003n)).rejects.toThrow('reviewed minimum');
  });
  it('never rounds a positive recovery minimum down to zero',async()=>{
    mocks.read.mockResolvedValue(Cl.uint(1));
    expect((await getWithdrawalQuote(address,adapter)).minimumSats).toBe(1n);
    expect((await withdrawalOptions(address,adapter,'withdraw')).functionArgs.at(-1)).toEqual(Cl.uint(1));
  });
  it('cannot substitute a different adapter or withdrawal type',async()=>{
    await expect(withdrawalOptions(address,address+'.evil','withdraw')).rejects.toThrow('No position');
    await expect(withdrawalOptions(address,adapter,'claim-withdraw')).rejects.toThrow('Incorrect');
  });
  it('does not silently write off a complete loss',async()=>{
    mocks.read.mockResolvedValue(Cl.uint(0));
    await expect(withdrawalOptions(address,adapter,'withdraw')).rejects.toThrow('explicit acceptance');
    expect((await withdrawalOptions(address,adapter,'withdraw',0n)).functionArgs.at(-1)).toEqual(Cl.uint(0));
  });
  it('keeps request and cancellation transfer-free in deny mode',async()=>{
    mocks.positions.mockResolvedValue([{adapter,principalSats:100000n,isAsync:true,status:'active',feeBps:500}]);
    const options=await withdrawalOptions(address,adapter,'request-withdraw');
    expect(options.postConditionMode).toBe('deny');expect(options.postConditions).toHaveLength(2);expect(options.functionArgs).toHaveLength(1);
  });
});
