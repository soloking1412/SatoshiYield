import { beforeEach,describe,expect,it,vi } from 'vitest';
import BigNumber from 'bignumber.js';
import {privateKeyToAccount} from 'viem/accounts';
import type {LombardQuote} from '../src/types.js';
import {wallet} from './fixtures.js';
const state=vi.hoisted(()=>({fee:'0.00001342',token:'0xc47e4b3124597fdf8dd07843d4a7052f2ee80c30',provider:undefined as any,typed:undefined as any,signature:undefined as any,metadata:{} as any,signMethod:'eth_signTypedData_v4',afterPrepare:undefined as undefined|(()=>void),afterSign:undefined as undefined|(()=>void),afterGenerate:undefined as undefined|(()=>void),skipSign:false,authorizeCalls:0,generateCalls:0,depositAddress:'',unknownStatus:false,omitProof:false,wrongExpiry:false}));
vi.mock('@lombard.finance/sdk',()=>({
  getTokenAddressForChain:()=> '0x107fc7d90484534704dd2a9e24c7bd45db4dd1b5',
  Token:{LBTC:'LBTC'},Env:{testnet:'testnet'},AssetId:{LBTC:'LBTC'},Chain:{SEPOLIA:'eip155:11155111',BITCOIN_SIGNET:'bip122:00000008819873e925422c1ff0f99f7c'},
  createLombardSDK:async(config:any)=>{
    expect(config.env).toBe('testnet');expect(config.partner.partnerId).toBe('test');state.provider=await config.providers.evm();
    return {assets:{getAddress:()=>state.token,getDecimals:()=>8},api:{exchangeRatio:async()=>({LBTC:{tokenBTCRatio:new BigNumber('0.99')}})},chain:{btc:{stake:(params:any)=>{
      expect(params).toEqual({assetOut:'LBTC',destChain:'eip155:11155111',sourceChain:'bip122:00000008819873e925422c1ff0f99f7c'});
      return {get mintingFee(){return state.fee},prepare:async()=>state.afterPrepare?.(),authorize:async()=>{
        state.authorizeCalls++;if(!state.skipSign)state.signature=await state.provider.request({method:state.signMethod,params:[account.address,JSON.stringify(state.typed)]});
      },generateDepositAddress:async()=>{state.generateCalls++;state.afterGenerate?.();return state.depositAddress}};
    }}}};
  },
}));
vi.mock('@lombard.finance/sdk/api',()=>({generateDepositBtcAddress:async()=>{state.generateCalls++;state.afterGenerate?.();return state.depositAddress},getNetworkFeeSignature:async()=>state.unknownStatus ? {} : ({hasSignature:!!state.signature,signature:state.omitProof ? undefined : state.signature,typedData:state.signature && !state.omitProof ? JSON.stringify(state.typed) : undefined,expirationDate:String(Number(state.typed.message.expiry)+(state.wrongExpiry?1:0))}),getDepositBtcAddresses:async()=>[{btc_address:state.depositAddress,deprecated:false,deposit_metadata:state.metadata}]}));
import { LOMBARD_SEPOLIA_LBTC,prepareLombardStake,validateLombardFeeAuthorization } from '../src/lombard.js';
// Deterministic local-only test key; never funded, persisted or used against a network.
const account=privateKeyToAccount(`0x${'01'.padStart(64,'0')}`);
let chain:string|number;let activeAccount:string;let signatureCount:number;
function typed(fee='1342') {return {domain:{name:'Lombard Staked Bitcoin',version:'1',chainId:11155111,verifyingContract:LOMBARD_SEPOLIA_LBTC},primaryType:'feeApproval',message:{chainId:11155111,fee,expiry:String(Math.floor(Date.now()/1000)+3600)},types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],feeApproval:[{name:'chainId',type:'uint256'},{name:'fee',type:'uint256'},{name:'expiry',type:'uint256'}]}}}
const provider={request:async({method,params}:any)=>{
  if(method==='eth_chainId')return chain;if(method==='eth_accounts')return[activeAccount];
  if(method==='eth_signTypedData_v4'){signatureCount++;const data=JSON.parse(params[1]);const result=await account.signTypedData(data);state.afterSign?.();return result;}
  throw new Error(`Unexpected wallet method ${method}`);
}};
const request=()=>({amountBtc:'0.001',recipient:account.address,expectedChainId:11155111 as const});
beforeEach(()=>{vi.restoreAllMocks();chain='0xaa36a7';activeAccount=account.address;signatureCount=0;Object.assign(state,{fee:'0.00001342',token:'0xc47e4b3124597fdf8dd07843d4a7052f2ee80c30',typed:typed(),signature:undefined,metadata:{partner_id:'test',to_address:account.address,to_blockchain:'DESTINATION_BLOCKCHAIN_ETHEREUM',token_address:LOMBARD_SEPOLIA_LBTC},signMethod:'eth_signTypedData_v4',afterPrepare:undefined,afterSign:undefined,afterGenerate:undefined,skipSign:false,authorizeCalls:0,generateCalls:0,depositAddress:wallet.address,unknownStatus:false,omitProof:false,wrongExpiry:false})});
describe('Lombard sandbox bound authorization and route',()=>{
  it('prepares without signing, quotes SDK fees and authorizes an exact registered destination only on explicit review',async()=>{
    const session=await prepareLombardStake(request(),provider);
    expect(signatureCount).toBe(0);expect(session.quote).toMatchObject({environment:'testnet',amountSats:100_000,mintingFeeBtc:'0.00001342',estimatedLbtc:'0.00097671',minimumOutputEnforced:false});
    const result=await session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest);
    expect(signatureCount).toBe(1);expect(result).toMatchObject({depositAddress:wallet.address,sourceNetwork:'signet',broadcastAllowed:false});
  });
  it.each(['0x1','0xaa36a8'])('rejects wrong EVM network %s before SDK authorization',async(wrong)=>{chain=wrong;await expect(prepareLombardStake(request(),provider)).rejects.toThrow('Sepolia');expect(signatureCount).toBe(0)});
  it('rejects a catalog token replacement',async()=>{state.token='0x'+'22'.repeat(20);await expect(prepareLombardStake(request(),provider)).rejects.toThrow('deployment changed')});
  it('binds account before and after asynchronous prepare and sign',async()=>{
    state.afterPrepare=()=>{activeAccount='0x'+'22'.repeat(20)};
    await expect(prepareLombardStake(request(),provider)).rejects.toThrow('account changed');
    activeAccount=account.address;state.afterPrepare=undefined;
    const session=await prepareLombardStake(request(),provider);state.afterSign=()=>{activeAccount='0x'+'22'.repeat(20)};
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('account changed');expect(state.generateCalls).toBe(0);
  });
  it('rejects increased fees and unexpected wallet transaction requests before signing',async()=>{
    const session=await prepareLombardStake(request(),provider);state.typed=typed('1343');
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('exceeds reviewed');expect(signatureCount).toBe(0);
    state.signMethod='eth_sendTransaction';await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('Unexpected wallet');expect(signatureCount).toBe(0);
  });
  it('validates reused fee signatures rather than silently trusting SDK cached authorization',async()=>{
    const session=await prepareLombardStake(request(),provider);state.skipSign=true;state.typed=typed('1343');state.signature=await account.signTypedData(state.typed);
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('exceeds reviewed');expect(state.generateCalls).toBe(0);
  });
  it.each(['partner_id','to_address','to_blockchain','token_address'])('refuses API address with wrong %s',async(field)=>{
    const session=await prepareLombardStake(request(),provider);state.metadata[field]='wrong';
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('registration does not match');
  });
  it('rejects altered digest, expired or closed review and keeps quote immutable to callers',async()=>{
    const session=await prepareLombardStake(request(),provider);const view=session.quote;view.mintingFeeBtc='1';
    expect(session.quote.mintingFeeBtc).toBe('0.00001342');
    await expect(session.authorizeAndGenerateDepositAddress('fake')).rejects.toThrow('changed or expired');
    vi.spyOn(Date,'now').mockReturnValue(session.quote.expiresAtMs+1);
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('expired');
    session.dispose();await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('closed');expect(signatureCount).toBe(0);
  });
  it('shows unavailable authorization when the real service response shape is empty, before signing',async()=>{
    state.unknownStatus=true;const session=await prepareLombardStake(request(),provider);
    expect(session.quote.authorizationReady).toBe(false);
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('incomplete status');expect(signatureCount).toBe(0);
  });
  it('uses the exact freshly signed proof when API acknowledges the same expiry but omits the proof',async()=>{
    state.omitProof=true;const session=await prepareLombardStake(request(),provider);
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).resolves.toMatchObject({depositAddress:wallet.address});expect(signatureCount).toBe(1);
  });
  it('refuses fresh-proof fallback when API expiry differs',async()=>{
    state.omitProof=true;state.wrongExpiry=true;const session=await prepareLombardStake(request(),provider);
    await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('expiry differs');expect(state.generateCalls).toBe(0);
  });
  it('never treats unknown cached signatures as fresh authorization',async()=>{
    state.signature='cached';state.omitProof=true;const session=await prepareLombardStake(request(),provider);
    expect(session.quote.authorizationReady).toBe(false);await expect(session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest)).rejects.toThrow('no verifiable signed proof');expect(signatureCount).toBe(0);
  });
  it('rejects wrong typed-data domain, permissive schema and oversized authorization duration',()=>{
    const quote={recipient:account.address,mintingFeeBtc:'0.00001342'} as LombardQuote;
    const a=typed();a.domain.chainId=1;expect(()=>validateLombardFeeAuthorization(a,quote)).toThrow('domain');
    const b=typed();b.types.feeApproval.push({name:'spender',type:'address'});expect(()=>validateLombardFeeAuthorization(b,quote)).toThrow('schema');
    const c=typed();c.message.expiry=String(Math.floor(Date.now()/1000)+100_000);expect(()=>validateLombardFeeAuthorization(c,quote)).toThrow('24-hour');
  });
});
