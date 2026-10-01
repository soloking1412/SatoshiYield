import {beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,within,waitFor,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const mock=vi.hoisted(()=>({connectBitcoin:vi.fn(),verifyBitcoin:vi.fn(),connectEvm:vi.fn(),context:vi.fn(),utxos:vi.fn(),build:vi.fn(),prepare:vi.fn(),authorize:vi.fn(),dispose:vi.fn()}));
vi.mock('../src/components/bitcoin/wallets.js',()=>({connectBitcoinSignet:mock.connectBitcoin,verifyBitcoinSignetWallet:mock.verifyBitcoin,connectSepolia:mock.connectEvm}));
vi.mock('../../integrations/bitcoin/src/index.js',()=>({fetchBabylonSignetContext:mock.context,fetchSignetUtxos:mock.utxos,buildBabylonStakePlan:mock.build,prepareLombardStake:mock.prepare,parseBtcAmount:(s:string)=>Math.round(Number(s)*100_000_000)}));
import BitcoinRoutes from '../src/components/bitcoin/BitcoinRoutes.js';
const recipient='0x1111111111111111111111111111111111111111';
const bitcoinWallet={network:'signet',address:'tb1qtestwallet',publicKeyHex:'02'+'11'.repeat(32),genesisHash:'0'.repeat(64)};
const context={bitcoinTipHeight:324468,babylonBitcoinTipHeight:324468,parameters:[{btcActivationHeight:273725,minStakingTimeBlocks:10_000,minStakingAmountSat:50000,covenantQuorum:6,covenantNoCoordPks:Array(9).fill('key')}],finalityProviders:[{publicKey:'provider',name:'Test provider',status:'active',commission:'0.05'}]};
const quote={amountBtc:'0.00100000',mintingFeeBtc:'0.00001342',estimatedLbtc:'0.00098632',reviewDigest:'reviewed',recipient,tokenAddress:'0x107fc7d90484534704dd2a9e24c7bd45db4dd1b5',authorizationReady:true,authorizationBlockReason:null};
beforeEach(()=>{vi.clearAllMocks();mock.connectBitcoin.mockResolvedValue(bitcoinWallet);mock.verifyBitcoin.mockResolvedValue(undefined);mock.connectEvm.mockResolvedValue({provider:{request:vi.fn()},address:recipient});mock.context.mockResolvedValue(context);mock.utxos.mockResolvedValue([]);mock.build.mockResolvedValue({stakingSats:100000,feeSats:342,stakingBlocks:10000,recovery:{earlyUnbondingBlocks:301,slashFraction:.05},reviewDigest:'unsigned-plan'});mock.prepare.mockResolvedValue({quote,dispose:mock.dispose,authorizeAndGenerateDepositAddress:mock.authorize});mock.authorize.mockResolvedValue({depositAddress:'tb1qverifiedonly',quote})});
describe('Bitcoin external route preparation UI',()=>{
  it('labels separated test routes and cannot prepare disconnected wallets',()=>{render(<BitcoinRoutes/>);expect(screen.getByRole('button',{name:'Review unsigned plan'})).toBeDisabled();expect(screen.getByRole('button',{name:'Get live quote'})).toBeDisabled();expect(screen.getByText(/No mainnet Bitcoin transactions/)).toBeInTheDocument()});
  it('loads public network and wallet inputs then reports unsigned preparation, never completed stake',async()=>{
    const u=userEvent.setup();render(<BitcoinRoutes/>);const area=screen.getByRole('region',{name:'Babylon staking'});
    await u.click(within(area).getByRole('button',{name:'Read current network'}));await within(area).findByText('324,468 / 324,468');
    await u.click(within(area).getByRole('button',{name:'Connect Bitcoin'}));
    await u.selectOptions(within(area).getByLabelText('Finality provider'),'provider');await u.type(within(area).getByLabelText('Amount in test BTC'),'0.001');await u.click(within(area).getByRole('button',{name:'Review unsigned plan'}));
    await within(area).findByText('Prepared · no funds moved');expect(mock.verifyBitcoin).toHaveBeenCalledTimes(2);expect(mock.build).toHaveBeenCalledWith(expect.objectContaining({wallet:bitcoinWallet,stakingSats:100000,finalityProviderPublicKey:'provider'}));expect(within(area).getByText(/does not sign or broadcast/)).toBeInTheDocument();expect(within(area).queryByRole('button',{name:/Stake now|Sign|Broadcast/})).not.toBeInTheDocument();
  });
  it('shows actual discovery failures without substituting example parameters',async()=>{mock.context.mockRejectedValue(new Error('Public network read failed (503)'));render(<BitcoinRoutes/>);fireEvent.click(screen.getByRole('button',{name:'Read current network'}));expect(await screen.findByRole('alert')).toHaveTextContent('503');expect(screen.getByRole('combobox')).toBeDisabled()});
  it('requires an explicit custody acknowledgement before Lombard authorization and passes frozen review digest',async()=>{
    const u=userEvent.setup();render(<BitcoinRoutes/>);const area=screen.getByRole('region',{name:'Lombard LBTC'});
    await u.click(within(area).getByRole('button',{name:'Connect Ethereum'}));await u.type(within(area).getByLabelText('Amount in test BTC'),'0.001');await u.click(within(area).getByRole('button',{name:'Get live quote'}));
    const authorize=await within(area).findByRole('button',{name:'Authorize test deposit address'});expect(authorize).toBeDisabled();expect(mock.authorize).not.toHaveBeenCalled();expect(within(area).getByText(/does not enforce a minimum/)).toBeInTheDocument();
    await u.click(within(area).getByRole('checkbox'));await u.click(authorize);await within(area).findByText('Test deposit address verified');expect(mock.authorize).toHaveBeenCalledExactlyOnceWith('reviewed');expect(within(area).getByText(/No Bitcoin transaction has been submitted/)).toBeInTheDocument();
  });
  it('keeps address authorization blocked when live service status cannot be verified',async()=>{
    mock.prepare.mockResolvedValue({quote:{...quote,authorizationReady:false,authorizationBlockReason:'Lombard testnet authorization service returned incomplete status.'},dispose:mock.dispose,authorizeAndGenerateDepositAddress:mock.authorize});
    const u=userEvent.setup();render(<BitcoinRoutes/>);const area=screen.getByRole('region',{name:'Lombard LBTC'});await u.click(within(area).getByRole('button',{name:'Connect Ethereum'}));await u.type(within(area).getByLabelText('Amount in test BTC'),'0.001');await u.click(within(area).getByRole('button',{name:'Get live quote'}));await within(area).findByText(/service returned incomplete status/);await u.click(within(area).getByRole('checkbox'));expect(within(area).getByRole('button',{name:'Authorize test deposit address'})).toBeDisabled();expect(mock.authorize).not.toHaveBeenCalled();
  });
  it('invalidates review when amount or wallet identity changes',async()=>{
    let onChange=()=>{};const provider={request:vi.fn(),on:vi.fn((event:string,fn:()=>void)=>{if(event==='accountsChanged')onChange=fn}),removeListener:vi.fn()};mock.connectEvm.mockResolvedValue({provider,address:recipient});
    const u=userEvent.setup();render(<BitcoinRoutes/>);const area=screen.getByRole('region',{name:'Lombard LBTC'});await u.click(within(area).getByRole('button',{name:'Connect Ethereum'}));const amount=within(area).getByLabelText('Amount in test BTC');await u.type(amount,'0.001');await u.click(within(area).getByRole('button',{name:'Get live quote'}));await within(area).findByText('Review before authorization');
    await u.type(amount,'1');expect(mock.dispose).toHaveBeenCalled();expect(within(area).queryByText('Review before authorization')).not.toBeInTheDocument();
    await u.click(within(area).getByRole('button',{name:'Get live quote'}));await within(area).findByText('Review before authorization');onChange();await waitFor(()=>expect(within(area).queryByText('Review before authorization')).not.toBeInTheDocument());expect(await screen.findByRole('alert')).toHaveTextContent('account or network changed');expect(mock.authorize).not.toHaveBeenCalled();
  });
});
