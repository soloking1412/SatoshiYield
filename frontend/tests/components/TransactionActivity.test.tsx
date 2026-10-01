import {describe,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
const mocks=vi.hoisted(()=>({transactions:[] as unknown[]}));
vi.mock('../../src/hooks/useTransactions.js',()=>({useTransactions:()=>mocks.transactions}));
import {TransactionActivity} from '../../src/components/portfolio/TransactionActivity.js';
describe('transaction activity presentation',()=>{
 it('distinguishes submitted, canonical success, failure, mismatch and unavailable receipts',()=>{
  mocks.transactions=['pending','success','failed','mismatch','unavailable'].map((state,i)=>({call:{txid:'0x'+String(i).repeat(64),network:'mainnet',sender:'SPWALLET',contract:'SPCONTRACT.vault',functionName:'withdraw',submittedAt:1000},receipt:{state,checkedAt:2000,detail:'Observed '+state,...state==='success'?{bitcoinConfirmations:1}:{}},isLoading:false,refresh:vi.fn()}));
  render(<TransactionActivity/>);
  for(const label of ['Awaiting confirmation','Confirmed on-chain','Failed on-chain','Transaction does not match','Confirmation unavailable'])expect(screen.getByText(label)).toBeVisible();
  expect(screen.getAllByText('Confirmed on-chain')).toHaveLength(1);expect(screen.getAllByRole('link',{name:/Explorer/})).toHaveLength(5);
 });
});
