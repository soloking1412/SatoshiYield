import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mock=vi.hoisted(()=>({address:'SPWALLET',read:vi.fn(),quote:vi.fn()}));
vi.mock('../../src/context/WalletContext.js',()=>({useWallet:()=>({address:mock.address})}));
vi.mock('../../src/lib/stacksClient.js',()=>({networkName:'mainnet'}));
vi.mock('../../../integrations/stacks/src/index.mjs',()=>({createStacksIntegrationClient:()=>({readState:mock.read,quote:mock.quote})}));
import {ProtocolHoldings} from '../../src/components/portfolio/ProtocolHoldings.js';
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ProtocolHoldings/></MemoryRouter></QueryClientProvider>)}
beforeEach(()=>{vi.clearAllMocks();mock.read.mockImplementation(async(protocol:string)=>({protocol,receiptBalance:protocol==='zest-sbtc'?123456789n:0n}));mock.quote.mockResolvedValue({expectedOut:120000000n})});
describe('on-demand protocol holdings',()=>{
 it('makes no background calls and shows exact receipts with current exit estimate on request',async()=>{mount();expect(mock.read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Load protocol holdings'}));expect(await screen.findByText('1.23456789 zsBTC')).toBeVisible();expect(screen.getByText('Exit estimate at last check: 1.2 sBTC')).toBeVisible();expect(screen.getByText('0 stBTC')).toBeVisible();expect(screen.getAllByRole('link',{name:/Review withdrawal/})[0]).toHaveAttribute('href','/integrations?protocol=zest-sbtc&action=redeem')});
 it('keeps failed protocol reads unavailable instead of manufacturing a zero balance',async()=>{mock.read.mockRejectedValue(new Error('Canonical read failed'));mount();fireEvent.click(screen.getByRole('button',{name:'Load protocol holdings'}));expect((await screen.findAllByText('Unavailable'))).toHaveLength(2);expect(screen.queryByText('0 stBTC')).not.toBeInTheDocument();expect(screen.getAllByText('Canonical read failed')).toHaveLength(2)});
 it('shows receipt ownership even when current liquidity cannot support redemption',async()=>{mock.quote.mockRejectedValue(new Error('Insufficient idle sBTC'));mount();fireEvent.click(screen.getByRole('button',{name:'Load protocol holdings'}));expect(await screen.findByText('1.23456789 zsBTC')).toBeVisible();expect(screen.getByText('Insufficient idle sBTC')).toBeVisible();expect(screen.queryByText(/Exit estimate at last check:/)).not.toBeInTheDocument()});
});
