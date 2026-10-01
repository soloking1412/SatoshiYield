import fs from 'node:fs';
import crypto from 'node:crypto';
const source = fs.readFileSync('contracts/adapters/hermetica-hbtc-adapter-v7.clar','utf8');
const replacements = {
  "'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2": '.mock-hermetica-upstream-v7',
  "'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.hq-v1": '.mock-hermetica-hq-v7',
  "'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.state-hbtc-v1": '.mock-hermetica-state-v7',
  "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token": '.mock-sbtc',
};
let generated = source;
for (const [from,to] of Object.entries(replacements)) {
  if (!generated.includes(from)) throw Error(`Missing binding ${from}`);
  generated = generated.replaceAll(from,to);
}
fs.mkdirSync('.cache-hermetica-v7/generated',{recursive:true});
fs.writeFileSync('.cache-hermetica-v7/generated/hermetica-hbtc-adapter-v7.clar',generated);
fs.writeFileSync('.cache-hermetica-v7/generated/bindings.json',JSON.stringify({
  warning:'Local token-moving model only; source modified by listed principal substitutions only.',
  sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
  generatedSha256:crypto.createHash('sha256').update(generated).digest('hex'),replacements,
},null,2)+'\n');
