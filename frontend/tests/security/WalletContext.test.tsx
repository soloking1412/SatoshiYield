import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {renderHook,waitFor,act} from '@testing-library/react';
import type {ReactNode} from 'react';
const mock=vi.hoisted(()=>({request:vi.fn(),show:vi.fn()}));
vi.mock('sats-connect',()=>({default:{request:mock.request,disconnect:vi.fn().mockResolvedValue(undefined)},AddressPurpose:{Stacks:'stacks'},BitcoinNetworkType:{Mainnet:'Mainnet',Testnet:'Testnet'},RpcErrorCode:{USER_REJECTION:4001},getSupportedWallets:()=>[],setDefaultProvider:vi.fn(),removeDefaultProvider:vi.fn()}));
vi.mock('../../src/context/ToastContext.js',()=>({useToast:()=>({show:mock.show})}));
import {WalletProvider,useWallet} from '../../src/context/WalletContext.js';
import {CONTRACTS} from '../../src/constants/contracts.js';
import {getSubmittedCalls} from '../../src/lib/transactionJournal.js';
const address='SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';
const args={expectedSender:address,contractAddress:CONTRACTS.VAULT.split('.')[0]!,contractName:'vault-v6',functionName:'withdraw',functionArgs:[]};
const txid='0x'+'a'.repeat(64);
function wrapper({children}:{children:ReactNode}){return <WalletProvider>{children}</WalletProvider>;}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();localStorage.setItem('satoshi.stx-address',address);localStorage.setItem('satoshi.stx-connector','xverse');mock.request.mockImplementation(async(method:string)=>method==='stx_getAddresses'?{status:'success',result:{addresses:[{address}],network:{stacks:{name:'Mainnet'}}}}:{status:'success',result:{txid}});});
afterEach(()=>{localStorage.clear();delete (window as unknown as {LeatherProvider?:unknown}).LeatherProvider;});
async function connected(){const hook=renderHook(()=>useWallet(),{wrapper});await waitFor(()=>expect(hook.result.current.address).toBe(address));return hook;}
describe('wallet identity and signing',()=>{
 it('rejects calls prepared for a different sender before any wallet request',async()=>{
   const {result}=await connected();
   await expect(result.current.callContract({...args,expectedSender:'SP000000000000000000002Q6VF78',postConditionMode:'allow'})).rejects.toThrow('session changed');
   expect(mock.request).not.toHaveBeenCalled();
 });
 it.each(['disconnect','address','connector','reconnect'])('rejects a %s while the identity check is pending',async(change)=>{
   const {result}=await connected();
   let finishIdentity!: (value:unknown)=>void;
   const identity=new Promise(resolve=>{finishIdentity=resolve;});
   mock.request.mockImplementation(async(method:string)=>method==='stx_getAddresses'?identity:{status:'success',result:{txid}});
   const pending=result.current.callContract({...args,postConditionMode:'allow'});
   const rejection=expect(pending).rejects.toThrow('session changed');
   await waitFor(()=>expect(mock.request).toHaveBeenCalledWith('stx_getAddresses',{}));
   const leatherRequest=vi.fn().mockResolvedValue({result:{addresses:[{address:change==='address'?'SP000000000000000000002Q6VF78':address}]}});
   (window as unknown as {LeatherProvider:unknown}).LeatherProvider={request:leatherRequest};
   if(change==='disconnect') await act(async()=>result.current.disconnect());
   else if(change==='reconnect') {
     await act(async()=>result.current.disconnect());
     mock.request.mockImplementation(async(method:string)=>method==='wallet_connect'?{status:'success',result:{addresses:[{purpose:'stacks',address}]}}:identity);
     await act(async()=>result.current.connect('xverse'));
   } else await act(async()=>result.current.connect('leather'));
   finishIdentity({status:'success',result:{addresses:[{address}],network:{stacks:{name:'Mainnet'}}}});
   await rejection;
   expect(mock.request.mock.calls.some(([method])=>method==='stx_callContract')).toBe(false);
   expect(leatherRequest.mock.calls.some(([method])=>method==='stx_callContract')).toBe(false);
 });
 it('defaults to deny even with no supplied postconditions',async()=>{const {result}=await connected();await act(async()=>{expect(await result.current.callContract(args)).toBe(txid);});expect(mock.request).toHaveBeenLastCalledWith('stx_callContract',expect.objectContaining({postConditionMode:'deny',postConditions:[]}));});
 it.each(['address','network'])('blocks a changed %s before signing',async(change)=>{const {result}=await connected();mock.request.mockResolvedValue({status:'success',result:{addresses:[{address:change==='address'?'SP000000000000000000002Q6VF78':address}],network:{stacks:{name:change==='network'?'Testnet':'Mainnet'}}}});await expect(result.current.callContract(args)).rejects.toThrow('changed');expect(mock.request).toHaveBeenCalledTimes(1);});
 it('records only the exact successfully submitted wallet request',async()=>{const {result}=await connected();await act(async()=>{await result.current.callContract(args);});expect(getSubmittedCalls()).toEqual([expect.objectContaining({txid,network:'mainnet',sender:address,contract:CONTRACTS.VAULT,functionName:'withdraw',functionArgs:[],postConditionMode:'deny'})]);});
 it('does not record a rejected or malformed wallet response as successful submission',async()=>{const {result}=await connected();mock.request.mockImplementation(async(method:string)=>method==='stx_getAddresses'?{status:'success',result:{addresses:[{address}],network:{stacks:{name:'Mainnet'}}}}:{status:'success',result:{txid:'wrong'}});await expect(result.current.callContract(args)).rejects.toThrow('submission status is unknown');expect(getSubmittedCalls()).toEqual([]);});
 it('rejects allow mode for arbitrary contracts and deposits',async()=>{const {result}=await connected();await expect(result.current.callContract({...args,contractName:'evil',postConditionMode:'allow'})).rejects.toThrow('restricted');await expect(result.current.callContract({...args,functionName:'deposit',postConditionMode:'allow'})).rejects.toThrow('restricted');expect(mock.request.mock.calls.some(([method])=>method==='stx_callContract')).toBe(false);});
 it('supports Leather native RPC with explicit network and fresh identity',async()=>{
   localStorage.setItem('satoshi.stx-connector','leather');
   const request=vi.fn().mockImplementation(async(method:string)=>({result:method==='getAddresses'?{addresses:[{address}]}:{txid}}));
   (window as unknown as {LeatherProvider:unknown}).LeatherProvider={request};
   const {result}=await connected();await act(async()=>{expect(await result.current.callContract(args)).toBe(txid);});
   expect(request).toHaveBeenNthCalledWith(1,'getAddresses',undefined);
   expect(request).toHaveBeenLastCalledWith('stx_callContract',expect.objectContaining({network:'mainnet',postConditionMode:'deny'}));
 });
});
