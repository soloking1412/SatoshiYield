import {readFile,stat,writeFile} from 'node:fs/promises';
import {privateKeyToAccount} from 'viem/accounts';
import {prepareLombardStake,LOMBARD_SEPOLIA_LBTC} from '../dist/index.js';
const walletPath=process.env.BITCOIN_TESTNET_WALLET_FILE;
if(!walletPath)throw new Error('Set BITCOIN_TESTNET_WALLET_FILE to the isolated newly generated testnet wallet file.');
if((await stat(walletPath)).mode & 0o077)throw new Error('Test key file must not be readable by group/others.');
const saved=JSON.parse(await readFile(walletPath,'utf8'));
if(saved.warning!=='TESTNET ONLY NEVER FUND ON MAINNET'||saved.ethereum.chainId!==11155111)throw new Error('Expected dedicated Sepolia test identity');
const account=privateKeyToAccount(`0x${saved.secretKeys.ethereum}`);
if(account.address!==saved.ethereum.address)throw new Error('Test identity address mismatch');
const rpc='https://ethereum-sepolia-rpc.publicnode.com';let signatures=0;
const report={timestamp:new Date().toISOString(),protocol:'lombard',environment:'testnet',chainId:11155111,sourceNetwork:'signet',recipient:account.address,signer:'New isolated testnet-only local identity; no user wallet',rpc,transactionsBroadcast:0};
const provider={async request({method,params}){
 if(method==='eth_accounts')return[account.address];
 if(method==='eth_signTypedData_v4'){
  const typed=JSON.parse(params[1]);
  if(Number(typed.domain.chainId)!==11155111||typed.domain.verifyingContract.toLowerCase()!==LOMBARD_SEPOLIA_LBTC||typed.primaryType!=='feeApproval')throw new Error('Unexpected test authorization');
  signatures++;return account.signTypedData(typed);
 }
 if(!['eth_chainId','eth_call','eth_getCode','eth_blockNumber'].includes(method))throw new Error('Unexpected RPC method');
 const res=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:params??[]}),signal:AbortSignal.timeout(12_000)});
 const body=await res.json();if(!res.ok||body.error)throw new Error('Public Sepolia RPC unavailable');return body.result;
}};
try{
 const session=await prepareLombardStake({amountBtc:'0.001',recipient:account.address,expectedChainId:11155111},provider);
 report.quote=session.quote;
 const instruction=await session.authorizeAndGenerateDepositAddress(session.quote.reviewDigest);
 report.status='address-registered-and-verified';report.depositAddress=instruction.depositAddress;report.addressVerifiedAt=new Date(instruction.verifiedAtMs).toISOString();
 session.dispose();
}catch(e){report.status='blocked';report.error=e.message;process.exitCode=1;}
report.signaturesRequested=signatures;report.btcFundingOrRedemptionTested=false;
await writeFile(new URL('../reports/lombard-address-registration.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
