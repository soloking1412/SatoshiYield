import {describe,expect,it} from 'vitest';
import {bitcoinWalletError} from '../src/components/bitcoin/wallets.js';

describe('Bitcoin wallet connection guidance',()=>{
  it('explains missing provider without hiding other wallet errors',()=>{
    expect(bitcoinWalletError(new Error('no wallet provider was found')).message).toMatch(/Install or unlock.*Signet.*Xverse/);
    const rejected = new Error('User rejected the connection');
    expect(bitcoinWalletError(rejected)).toBe(rejected);
    expect(bitcoinWalletError(new Error('Select Signet in your Bitcoin wallet.')).message).toBe('Select Signet in your Bitcoin wallet.');
  });
});
