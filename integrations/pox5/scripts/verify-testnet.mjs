import {createPox5Client} from '../src/index.mjs';
import {writeFile} from 'node:fs/promises';
const address='ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX';
const output={checkedAt:new Date().toISOString(),scope:'Read-only public PoX-5 eligibility; no BTC/STX funding or registration broadcast',network:'testnet',observations:[]};
try {const client=createPox5Client();for(const bondIndex of [10,11])output.observations.push(await client.observe({address,bondIndex,amountSats:100000n}));output.passed=true;}
catch(error){output.passed=false;output.error=String(error);process.exitCode=1;}
await writeFile(new URL('../evidence/testnet-eligibility.json',import.meta.url),JSON.stringify(output,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify({passed:output.passed,error:output.error,observations:output.observations.map(s=>({bondIndex:s.bondIndex,status:s.status,reasons:s.reasons,allowance:s.allowance.toString(),requiredUstx:s.requiredUstx?.toString(),fundingAllowed:s.fundingAllowed}))},null,2));
