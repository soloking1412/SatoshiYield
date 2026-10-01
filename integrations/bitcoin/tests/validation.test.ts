import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { parseBtcAmount,satsToBtc } from '../src/validation.js';
import { getBitcoinCapabilities,getExternalProtocolHandoff } from '../src/index.js';
import { parseBabylonParameters } from '../src/discovery.js';

describe('amounts and external capability boundaries',()=>{
  it('roundtrips integer satoshis without floating point truncation',()=>{
    fc.assert(fc.property(fc.integer({min:1,max:2_100_000_000_000_000}),sats=>{expect(parseBtcAmount(satsToBtc(sats))).toBe(sats)}),{numRuns:500});
  });
  it.each(['0','-1','0.000000001','1e-8','NaN','Infinity',' 1','01','21000000.00000001'])('rejects ambiguous or unsafe amount %s',v=>expect(()=>parseBtcAmount(v)).toThrow());
  it('does not fabricate external custody deposit addresses or enable broadcast',()=>{
    expect(getBitcoinCapabilities().every(c=>!c.broadcastEnabled)).toBe(true);
    expect(getExternalProtocolHandoff('solv')).toMatchObject({external:true,isSatoshiVault:false,depositAddress:null});
    expect(getExternalProtocolHandoff('stacks-native-btc').officialUrl).toContain('stacks.co/');
    expect(()=>getExternalProtocolHandoff('phishing' as any)).toThrow();
  });
  it('rejects missing, duplicated, unsafe or malformed Babylon parameter sets',()=>{
    expect(()=>parseBabylonParameters([])).toThrow();
    expect(()=>parseBabylonParameters([{version:'9007199254740992'}])).toThrow();
    expect(()=>parseBabylonParameters([{version:1,covenant_pks:['00'.repeat(32),'00'.repeat(32)]}])).toThrow('Duplicate covenant');
  });
});
