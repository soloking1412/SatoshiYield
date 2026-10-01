import {beforeEach,describe,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
const mock=vi.hoisted(()=>({address:'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2' as string|null,network:'mainnet',call:vi.fn(),read:vi.fn(),claimState:vi.fn(),claim:vi.fn(),quote:vi.fn(),route:vi.fn(),connect:vi.fn()}));
vi.mock('../../src/context/WalletContext.js',()=>({useWallet:()=>({address:mock.address,callContract:mock.call})}));
vi.mock('../../src/context/ConnectModalContext.js',()=>({useConnectModal:()=>({openConnectModal:mock.connect})}));
vi.mock('../../src/lib/stacksClient.js',()=>({get networkName(){return mock.network}}));
vi.mock('../../../integrations/stacks/src/index.mjs',()=>({createStacksIntegrationClient:()=>({readState:mock.read,readClaimState:mock.claimState,readClaim:mock.claim,quote:mock.quote,buildUnsignedRoute:mock.route})}));
import {StacksRoutes} from '../../src/components/StacksRoutes.js';
const state={protocol:'zest-sbtc',owner:mock.address,assetBalance:1000000n,receiptBalance:200000n,stacksHeight:100,burnHeight:100,sources:[{contract:'source',sha256:'a'}]};
const quote={protocol:'zest-sbtc',action:'deposit',owner:mock.address,amount:100000n,expectedOut:99990n,minimumOut:99490n,fee:0n,executable:true,state};
function mount(){return render(<MemoryRouter><StacksRoutes/></MemoryRouter>)}
async function review(){fireEvent.change(screen.getByLabelText('Amount to deposit'),{target:{value:'0.001'}});fireEvent.click(screen.getByRole('button',{name:'Review quote'}));await screen.findByText('Review this action')}
beforeEach(()=>{vi.clearAllMocks();mock.address=state.owner;mock.network='mainnet';mock.read.mockResolvedValue(state);mock.claimState.mockResolvedValue(state);mock.quote.mockResolvedValue(quote);mock.claim.mockResolvedValue({...quote,action:'claim',claimId:1n,unlockBurnHeight:100n});mock.route.mockReturnValue({transaction:{contractAddress:'SPCONTRACT',contractName:'vault',functionName:'deposit',functionArgs:[],postConditions:[]}});mock.call.mockResolvedValue('0x'+'a'.repeat(64))});
describe('direct Stacks route review',()=>{
 it('keeps protocol calls unavailable until wallet connects',()=>{mock.address=null;mount();expect(screen.getByRole('button',{name:'Connect Stacks wallet'})).toBeEnabled();expect(mock.read).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Review quote'})).not.toBeInTheDocument()});
 it('does not connect mainnet routes to a testnet wallet',()=>{mock.network='testnet';mount();expect(screen.getByText(/these wallet actions are unavailable here/)).toBeVisible();expect(mock.read).not.toHaveBeenCalled()});
 it('requires reviewed consent and rechecks state before sending exact wallet-bound deny call',async()=>{mount();await review();expect(screen.getByRole('button',{name:'Continue in wallet'})).toBeDisabled();expect(mock.quote).toHaveBeenCalledWith(state,'deposit',100000n);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Continue in wallet'}));await screen.findByText('Submitted. Confirmation is pending.');expect(mock.read).toHaveBeenCalledTimes(2);expect(mock.call).toHaveBeenCalledWith(expect.objectContaining({expectedSender:state.owner,postConditionMode:'deny'}));expect(screen.queryByText('Confirmed on-chain')).not.toBeInTheDocument()});
 it('forces renewed review instead of silently reducing the signed minimum',async()=>{mock.quote.mockResolvedValueOnce(quote).mockResolvedValueOnce({...quote,minimumOut:99400n});mount();await review();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Continue in wallet'}));expect(await screen.findByRole('alert')).toHaveTextContent('quote changed');expect(mock.call).not.toHaveBeenCalled();expect(screen.getByRole('checkbox')).not.toBeChecked()});
 it('clears an old review when amount changes and hides unavailable balances after read failure',async()=>{mount();await review();fireEvent.change(screen.getByLabelText('Amount to deposit'),{target:{value:'0.002'}});expect(screen.queryByText('Review this action')).not.toBeInTheDocument();mock.read.mockRejectedValueOnce(new Error('RPC failed'));fireEvent.click(screen.getByRole('button',{name:'Refresh balances'}));expect(await screen.findByRole('alert')).toHaveTextContent('RPC failed');expect(screen.getByText('Balances have not been checked')).toBeVisible()});
 it('uses the dedicated exit observation for an existing NFT',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:/StackingDAO/}));fireEvent.click(screen.getByRole('button',{name:'Claim NFT'}));fireEvent.change(screen.getByLabelText('Withdrawal NFT ID'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'Check claim'}));await waitFor(()=>expect(mock.claimState).toHaveBeenCalledWith(state.owner));expect(mock.read).not.toHaveBeenCalled();expect(mock.claim).toHaveBeenCalledWith(state,'1')});
 it('does not offer wallet signing for an undeployed queue guard',async()=>{mock.quote.mockResolvedValue({...quote,action:'request',executable:false,reason:'The atomic guard is not deployed.',maxCooldownBurnBlocks:4200n});mount();fireEvent.click(screen.getByRole('button',{name:/StackingDAO/}));fireEvent.click(screen.getByRole('button',{name:'Queue exit'}));fireEvent.change(screen.getByLabelText('Amount to withdraw'),{target:{value:'0.001'}});fireEvent.click(screen.getByRole('button',{name:'Review quote'}));await screen.findByText('The atomic guard is not deployed.');expect(screen.getByText('4200 Bitcoin burn blocks')).toBeVisible();expect(screen.queryByRole('button',{name:'Continue in wallet'})).not.toBeInTheDocument()});
 it('requires renewed review for increased fee or queue duration before opening a wallet',async()=>{
  for(const change of [{fee:1n},{maxCooldownBurnBlocks:4201n}]){
   mock.quote.mockReset();mock.quote.mockResolvedValueOnce({...quote,maxCooldownBurnBlocks:4200n}).mockResolvedValueOnce({...quote,maxCooldownBurnBlocks:4200n,...change});
   const view=mount();await review();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Continue in wallet'}));expect(await screen.findByRole('alert')).toHaveTextContent('quote changed');expect(mock.call).not.toHaveBeenCalled();view.unmount();
  }
 });
 it('discards delayed reads when the connected wallet changes',async()=>{
  let resolve!: (value:unknown)=>void;mock.read.mockReturnValueOnce(new Promise(r=>{resolve=r}));
  const view=mount();fireEvent.change(screen.getByLabelText('Amount to deposit'),{target:{value:'0.001'}});fireEvent.click(screen.getByRole('button',{name:'Review quote'}));await waitFor(()=>expect(mock.read).toHaveBeenCalled());
  mock.address='SP8YMPEBK0P9W3SYCAEB1M1XJFEJTP08RWG4G16E';view.rerender(<MemoryRouter><StacksRoutes/></MemoryRouter>);
  await act(async()=>{resolve(state)});expect(screen.queryByText('Review this action')).not.toBeInTheDocument();expect(mock.call).not.toHaveBeenCalled();
 });
 it('clears an approved quote after wallet identity changes',async()=>{
  const view=mount();await review();fireEvent.click(screen.getByRole('checkbox'));mock.address='SP8YMPEBK0P9W3SYCAEB1M1XJFEJTP08RWG4G16E';view.rerender(<MemoryRouter><StacksRoutes/></MemoryRouter>);expect(screen.queryByRole('button',{name:'Continue in wallet'})).not.toBeInTheDocument();expect(mock.call).not.toHaveBeenCalled();
 });
});
