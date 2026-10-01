import {writeFile} from 'node:fs/promises';
import {fetchBabylonSignetContext,prepareLombardStake} from '../dist/index.js';
const report={timestamp:new Date().toISOString(),purpose:'Read-only public testnet SDK and endpoint validation',transactionsBroadcast:0,signaturesRequested:0,privateKeysUsed:false,protocols:{}};
try {
 const c=await fetchBabylonSignetContext();
 report.protocols.babylon={status:'live-read-success',network:c.network,babylonChainId:c.babylonChainId,genesisHash:c.genesisHash,bitcoinTipHeight:c.bitcoinTipHeight,babylonBitcoinTipHeight:c.babylonBitcoinTipHeight,parameterSource:c.parameterSource,parameters:c.parameters.at(-1),versionsObserved:c.parameters.map(p=>p.version),minimumStakingConfirmations:c.minimumStakingConfirmations,providersObserved:c.finalityProviders.length,activeProvidersObserved:c.finalityProviders.filter(p=>p.status==='active').length,sdk:'@babylonlabs-io/btc-staking-ts@2.8.6',fundingAndDelegationTested:false};
} catch(e) {report.protocols.babylon={status:'unavailable',error:e.message};process.exitCode=1;}
try {
 // Public dummy recipient; the only mocked part is wallet account/network reads. No authorization is invoked.
 const recipient='0x1111111111111111111111111111111111111111';
 const provider={async request({method}) {if(method==='eth_accounts')return[recipient];if(method==='eth_chainId')return'0xaa36a7';throw new Error(`Signing/unsupported method forbidden: ${method}`)}};
 const s=await prepareLombardStake({amountBtc:'0.001',recipient,expectedChainId:11155111},provider);
 const {recipient:_recipient,reviewDigest:_digest,...quote}=s.quote;
 report.protocols.lombard={status:'live-quote-success',sdk:'@lombard.finance/sdk@5.9.0',publicRpcAndApi:true,walletProvider:'mocked eth_accounts/eth_chainId only; authorization forbidden',quote,addressRegistrationTested:false,btcFundingOrRedemptionTested:false};
 s.dispose();
} catch(e) {report.protocols.lombard={status:'unavailable',error:e.message};process.exitCode=1;}
await writeFile(new URL('../reports/live-read.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
