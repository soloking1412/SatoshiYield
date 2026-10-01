import { writeFile } from 'node:fs/promises';
import { createStacksIntegrationClient } from '../src/index.mjs';
const client=createStacksIntegrationClient();
const owner='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const evidence={checkedAt:new Date().toISOString(),scope:'Read-only mainnet state, source pin, registry and quote verification; no transactions signed or broadcast',owner,observations:[]};
try {
 for(const protocol of ['zest-sbtc','stackingdao-stbtc']) {
  const state=await client.readState(protocol,owner);
  const quote=await client.quote(state,'deposit',100000n);
  const route=client.buildUnsignedRoute(quote,{walletAddress:owner,network:'mainnet'});
  evidence.observations.push({protocol,state,quote:{amount:quote.amount,expectedOut:quote.expectedOut,minimumOut:quote.minimumOut,fee:quote.fee,expiresAt:quote.expiresAt},route:{contract:`${route.transaction.contractAddress}.${route.transaction.contractName}`,function:route.transaction.functionName,postConditionMode:route.transaction.postConditionMode,rules:route.rules}});
 }
 evidence.passed=true;
} catch(error) {evidence.passed=false;evidence.error=String(error);process.exitCode=1;}
await writeFile(new URL('../evidence/mainnet-readonly.json',import.meta.url),JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({passed:evidence.passed,error:evidence.error,observations:evidence.observations.map(({protocol,state,quote})=>({protocol,tip:state.tip,quote}))},(_,v)=>typeof v==='bigint'?v.toString():v,2));
