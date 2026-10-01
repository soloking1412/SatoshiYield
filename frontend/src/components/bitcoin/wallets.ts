import type { BitcoinWalletBinding, Eip1193Provider } from '../../../../integrations/bitcoin/src/types.js';
import { SIGNET_GENESIS } from '../../../../integrations/bitcoin/src/types.js';

const installBitcoinWallet = 'Install or unlock a Bitcoin wallet with Signet support, then connect again. This preparation flow currently supports Xverse.';
export function bitcoinWalletError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return /no wallet provider (?:was )?found|wallet provider (?:is )?not found/i.test(message)
    ? new Error(installBitcoinWallet)
    : error instanceof Error ? error : new Error(message);
}

export async function connectBitcoinSignet(): Promise<BitcoinWalletBinding> {
  try {
  const {default:Wallet,getSupportedWallets,setDefaultProvider,AddressPurpose,BitcoinNetworkType} = await import('sats-connect');
  const xverse = getSupportedWallets().find(w=>/xverse/i.test(w.name));
  if(!xverse) throw new Error('Install a Bitcoin wallet with Signet support. This preparation flow currently supports Xverse.');
  setDefaultProvider(xverse.id);
  const response = await Wallet.request('wallet_connect',{addresses:[AddressPurpose.Payment],network:BitcoinNetworkType.Signet,message:'Read Signet test coins for SatoshiYield preparation'});
  if(response.status === 'error') throw new Error(response.error.message);
  if(response.result.network.bitcoin.name !== BitcoinNetworkType.Signet) throw new Error('Select Signet in your Bitcoin wallet. Bitcoin testnet is a different network.');
  const address = response.result.addresses.find(a=>a.purpose===AddressPurpose.Payment);
  if(!address) throw new Error('Bitcoin wallet did not provide its payment account.');
  if(!address.address.startsWith('tb1')) throw new Error('Select a native SegWit or Taproot payment account in the wallet for this preparation flow.');
  const publicKeyHex=address.publicKey.length===64 ? `02${address.publicKey}` : address.publicKey;
  return {network:'signet',genesisHash:SIGNET_GENESIS,address:address.address,publicKeyHex};
  } catch (error) { throw bitcoinWalletError(error); }
}
export async function verifyBitcoinSignetWallet(expected: BitcoinWalletBinding): Promise<void> {
  try {
  const {default:Wallet,AddressPurpose,BitcoinNetworkType}=await import('sats-connect');
  const response=await Wallet.request('getAddresses',{purposes:[AddressPurpose.Payment],message:'Verify the account for this Bitcoin plan'});
  if(response.status==='error')throw new Error(response.error.message);
  const current=response.result.addresses.find(a=>a.purpose===AddressPurpose.Payment);
  const key=current?.publicKey.length===64 ? `02${current.publicKey}` : current?.publicKey;
  if(response.result.network.bitcoin.name!==BitcoinNetworkType.Signet||current?.address!==expected.address||key!==expected.publicKeyHex)throw new Error('Bitcoin account or network changed. Connect and review again.');
  } catch (error) { throw bitcoinWalletError(error); }
}
export type BrowserEvmProvider=Eip1193Provider & {on?:(event:string,listener:()=>void)=>void;removeListener?:(event:string,listener:()=>void)=>void};
export function injectedEvmProvider(): BrowserEvmProvider {
  const provider=(window as unknown as {ethereum?:BrowserEvmProvider}).ethereum;
  if(!provider?.request)throw new Error('Install an Ethereum-compatible wallet and select Sepolia to try this test route.');
  return provider;
}
export async function connectSepolia(): Promise<{provider:BrowserEvmProvider;address:string}> {
  const provider=injectedEvmProvider();
  const chain=await provider.request({method:'eth_chainId'});
  if(chain!=='0xaa36a7' && chain!==11155111)throw new Error('Select Sepolia in your Ethereum wallet, then reconnect.');
  const accounts=await provider.request({method:'eth_requestAccounts'});
  if(!Array.isArray(accounts)||typeof accounts[0]!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(accounts[0]))throw new Error('Wallet did not return a valid recipient.');
  return {provider,address:accounts[0]};
}
