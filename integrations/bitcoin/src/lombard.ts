import type { Eip1193Provider, LombardDepositInstruction, LombardQuote, LombardStakeRequest } from './types.js';
import { MAX_CONTEXT_AGE_MS } from './types.js';
import { canonicalJson, digest, ensure, integer, parseBtcAmount, satsToBtc } from './validation.js';

/** Official SDK 5.9.0 transaction resolver, verified 2026-10-01. Its display catalog differs. */
export const LOMBARD_SEPOLIA_LBTC = '0x107fc7d90484534704dd2a9e24c7bd45db4dd1b5';
export const LOMBARD_SEPOLIA_CATALOG_LBTC = '0xc47e4b3124597fdf8dd07843d4a7052f2ee80c30';
const CHAIN_ID = 11155111 as const;
const EXPECTED_TYPES = {
  EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],
  feeApproval:[{name:'chainId',type:'uint256'},{name:'fee',type:'uint256'},{name:'expiry',type:'uint256'}],
};
function feeSats(value: string): number { return value === '0' || /^0\.0+$/.test(value) ? 0 : parseBtcAmount(value); }
export function validateLombardFeeAuthorization(typedData: unknown, quote: LombardQuote, now = Date.now()): Record<string, any> {
  const data = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;
  ensure(data && typeof data === 'object','Missing Lombard fee authorization');
  const d = data as Record<string, any>;
  ensure(d.primaryType === 'feeApproval' && d.domain?.name === 'Lombard Staked Bitcoin' && d.domain?.version === '1' && Number(d.domain?.chainId) === CHAIN_ID && d.domain?.verifyingContract?.toLowerCase() === LOMBARD_SEPOLIA_LBTC,'Lombard authorization domain/chain/token mismatch');
  ensure(canonicalJson(d.types) === canonicalJson(EXPECTED_TYPES),'Unexpected Lombard authorization message schema');
  ensure(Object.keys(d.message ?? {}).sort().join(',') === 'chainId,expiry,fee' && Number(d.message.chainId) === CHAIN_ID,'Unexpected Lombard authorization payload');
  ensure(integer(d.message.fee,'authorized minting fee') <= feeSats(quote.mintingFeeBtc),'Authorization fee exceeds reviewed quote');
  const expiry = integer(d.message.expiry,'authorization expiry',1);
  ensure(expiry * 1000 > now && expiry * 1000 <= now + 86_460_000,'Lombard fee authorization expires outside the reviewed 24-hour limit');
  if (d.account) ensure(d.account.toLowerCase() === quote.recipient.toLowerCase(),'Authorization recipient mismatch');
  return d;
}
async function boundWallet(provider: Eip1193Provider, recipient: string): Promise<void> {
  const [chain,accounts] = await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);
  ensure(chain === '0xaa36a7' || chain === CHAIN_ID,'Switch the destination wallet to Sepolia before preparing this route');
  ensure(Array.isArray(accounts) && typeof accounts[0] === 'string' && accounts[0].toLowerCase() === recipient.toLowerCase(),'Destination wallet account changed or is disconnected');
}
export interface LombardStakeSession {
  readonly quote: LombardQuote;
  /** Explicit user action. May request an EIP-712 signature and register a testnet deposit address; never sends BTC. */
  authorizeAndGenerateDepositAddress(reviewDigest: string): Promise<LombardDepositInstruction>;
  dispose(): void;
}
/** Read-only preparation; SDK is lazy loaded and requires no private key or BTC signing provider. */
export async function prepareLombardStake(request: LombardStakeRequest, provider: Eip1193Provider): Promise<LombardStakeSession> {
  const input = structuredClone(request);
  ensure(input.expectedChainId === CHAIN_ID,'Only official Lombard Signet/Sepolia sandbox is enabled');
  const amountSats = parseBtcAmount(input.amountBtc);
  ensure(amountSats >= 20_000,'Lombard test deposits must be at least 0.0002 BTC; actual SDK fee and limits are also checked');
  ensure(/^0x[0-9a-fA-F]{40}$/.test(input.recipient) && !/^0x0{40}$/i.test(input.recipient),'Invalid EVM recipient');
  await boundWallet(provider,input.recipient);
  if (typeof globalThis.Buffer === 'undefined') { const {Buffer} = await import('buffer'); globalThis.Buffer = Buffer as typeof globalThis.Buffer; }
  const [sdkModule,apiModule,{default:BigNumber}] = await Promise.all([import('@lombard.finance/sdk'),import('@lombard.finance/sdk/api'),import('bignumber.js')]);
  let quote: LombardQuote | undefined;
  let signingEnabled = false;
  let disposed = false;
  let freshAuthorization: {signature:string;typedData:string} | undefined;
  let running = false;
  const guardedProvider = {
    request: async (args: {method:string;params?: unknown[] | Record<string,unknown>}) => {
      ensure(!disposed,'Lombard review session closed');
      const readonly = ['eth_chainId','eth_accounts','eth_call','eth_getCode','eth_blockNumber'];
      if (readonly.includes(args.method)) return provider.request(args);
      ensure(args.method === 'eth_signTypedData_v4' && signingEnabled && quote,'Unexpected wallet operation; only explicitly reviewed fee authorization is allowed');
      ensure(quote.expiresAtMs > Date.now(),'Lombard quote expired');
      await boundWallet(provider,input.recipient);
      ensure(Array.isArray(args.params) && typeof args.params[0] === 'string' && args.params[0].toLowerCase() === input.recipient.toLowerCase(),'SDK requested signature from another account');
      const typed = validateLombardFeeAuthorization(args.params[1],quote);
      const signature = await provider.request(args);
      await boundWallet(provider,input.recipient);
      ensure(typeof signature === 'string','Wallet returned no authorization signature');
      const { recoverTypedDataAddress } = await import('viem');
      const recovered = await recoverTypedDataAddress({...typed,signature} as Parameters<typeof recoverTypedDataAddress>[0]);
      ensure(recovered.toLowerCase() === input.recipient.toLowerCase(),'Wallet authorization signature does not belong to the reviewed recipient');
      freshAuthorization={signature,typedData:JSON.stringify(typed)};
      return signature;
    },
  };
  const sdk = await sdkModule.createLombardSDK({env:sdkModule.Env.testnet,partner:{partnerId:'test'},providers:{evm:()=>guardedProvider as any},logger:{error(){},warn(){},info(){},debug(){}}});
  ensure(sdk.assets.getAddress(sdkModule.AssetId.LBTC,sdkModule.Chain.SEPOLIA)?.toLowerCase() === LOMBARD_SEPOLIA_CATALOG_LBTC && sdkModule.getTokenAddressForChain(CHAIN_ID,undefined,sdkModule.Env.testnet)?.toLowerCase() === LOMBARD_SEPOLIA_LBTC && sdk.assets.getDecimals(sdkModule.AssetId.LBTC) === 8,'Official Lombard testnet deployment changed; integration review required');
  const action = sdk.chain.btc.stake({assetOut:sdkModule.AssetId.LBTC,destChain:sdkModule.Chain.SEPOLIA,sourceChain:sdkModule.Chain.BITCOIN_SIGNET});
  await action.prepare({amount:satsToBtc(amountSats),recipient:input.recipient});
  await boundWallet(provider,input.recipient);
  // The concrete BtcStake class exposes its fetched fee; the generic interface omits it.
  const mintingFee = (action as typeof action & {mintingFee?:string}).mintingFee;
  ensure(typeof mintingFee === 'string','Lombard did not return a minting fee');
  const fee = feeSats(mintingFee);
  ensure(fee < amountSats,'Deposit cannot cover Lombard minting fee');
  const ratios = await sdk.api.exchangeRatio();
  const ratio = new BigNumber(ratios.LBTC.tokenBTCRatio.toFixed());
  ensure(ratio.isFinite() && ratio.gt(0),'Lombard exchange ratio is unavailable');
  const estimatedLbtc = new BigNumber(amountSats - fee).div(100_000_000).times(ratio).toFixed(8,BigNumber.ROUND_DOWN);
  const readiness = await apiModule.getNetworkFeeSignature({chainId:CHAIN_ID,address:input.recipient,env:sdkModule.Env.testnet,tokenAddress:LOMBARD_SEPOLIA_LBTC});
  const authorizationBlockReason = typeof readiness.hasSignature !== 'boolean' ? 'Lombard testnet authorization service returned incomplete status. Address registration is unavailable.' : readiness.hasSignature && (!readiness.signature || !readiness.typedData) ? 'Existing Lombard authorization has no verifiable signed proof. Wait for its expiry or use a fresh test recipient.' : null;
  const payload: Omit<LombardQuote,'reviewDigest'> = {protocol:'lombard',environment:'testnet',partnerId:'test',sourceNetwork:'signet',destinationChainId:CHAIN_ID,recipient:input.recipient,amountBtc:satsToBtc(amountSats),amountSats,token:'LBTC',tokenAddress:LOMBARD_SEPOLIA_LBTC,catalogTokenAddress:LOMBARD_SEPOLIA_CATALOG_LBTC,deploymentSource:'sdk-transaction-resolver',tokenDecimals:8,mintingFeeBtc:satsToBtc(fee),estimatedLbtc,expiresAtMs:Date.now()+MAX_CONTEXT_AGE_MS,custody:'lombard-consortium',minimumOutputEnforced:false,authorizationReady:authorizationBlockReason === null,authorizationBlockReason};
  quote = {...payload,reviewDigest:await digest(payload)};
  const frozen = structuredClone(quote);
  return {
    get quote() { return structuredClone(frozen); },
    dispose() { disposed = true; },
    async authorizeAndGenerateDepositAddress(reviewDigest: string) {
      ensure(!disposed && !running,'Lombard session is closed or an authorization is already running');
      ensure(frozen.authorizationReady,frozen.authorizationBlockReason ?? 'Lombard authorization is unavailable');
      ensure(reviewDigest === frozen.reviewDigest && frozen.expiresAtMs > Date.now(),'Lombard quote changed or expired; review again');
      running = true;
      try {
        await boundWallet(provider,input.recipient);
        const previous = await apiModule.getNetworkFeeSignature({chainId:CHAIN_ID,address:input.recipient,env:sdkModule.Env.testnet,tokenAddress:LOMBARD_SEPOLIA_LBTC});
        ensure(typeof previous.hasSignature === 'boolean','Lombard authorization service returned incomplete status; signing is unavailable');
        // Unknown cached authorizations must never silently inherit another fee ceiling.
        if(previous.hasSignature) ensure(previous.signature && previous.typedData,'Existing Lombard fee authorization is missing its signed proof; wait for expiry or use a fresh test recipient');
        signingEnabled = true;
        await action.authorize();
        signingEnabled = false;
        await boundWallet(provider,input.recipient);
        ensure(!disposed && frozen.expiresAtMs > Date.now(),'Lombard review expired or closed during authorization');
        const auth = await apiModule.getNetworkFeeSignature({chainId:CHAIN_ID,address:input.recipient,env:sdkModule.Env.testnet,tokenAddress:LOMBARD_SEPOLIA_LBTC});
        ensure(auth.hasSignature,'Cannot verify stored Lombard fee authorization');
        const proof = auth.signature && auth.typedData ? {signature:auth.signature,typedData:auth.typedData} : (!previous.hasSignature ? freshAuthorization : undefined);
        ensure(proof,'Cannot verify stored Lombard fee authorization');
        const typed = validateLombardFeeAuthorization(proof.typedData,frozen);
        if(!auth.signature || !auth.typedData) ensure(Number(auth.expirationDate) === Number(typed.message.expiry),'Stored authorization expiry differs from the freshly reviewed signature');
        const {recoverTypedDataAddress} = await import('viem');
        const recovered = await recoverTypedDataAddress({...typed,signature:proof.signature} as Parameters<typeof recoverTypedDataAddress>[0]);
        ensure(recovered.toLowerCase() === input.recipient.toLowerCase(),'Stored authorization signer is not the reviewed recipient');
        await boundWallet(provider,input.recipient);
        // The SDK API receives the exact proof validated above, instead of opaque cached action state.
        const depositAddress = await apiModule.generateDepositBtcAddress({address:input.recipient,chainId:CHAIN_ID,env:sdkModule.Env.testnet,partnerId:'test',token:sdkModule.Token.LBTC,signature:proof.signature,eip712Data:proof.typedData});
        const records = await apiModule.getDepositBtcAddresses({address:input.recipient,chainId:CHAIN_ID,env:sdkModule.Env.testnet,partnerId:'test',limit:20});
        const record = records?.find(r => r.btc_address === depositAddress && r.deprecated !== true);
        ensure(record && record.deposit_metadata.partner_id === 'test' && record.deposit_metadata.to_address.toLowerCase() === input.recipient.toLowerCase() && ['DESTINATION_BLOCKCHAIN_ETHEREUM','BLOCKCHAIN_ETHEREUM'].includes(record.deposit_metadata.to_blockchain) && record.deposit_metadata.token_address?.toLowerCase() === LOMBARD_SEPOLIA_LBTC,'Deposit address registration does not match partner, recipient, chain or token');
        const {address,networks} = await import('bitcoinjs-lib');
        address.toOutputScript(depositAddress,networks.testnet);
        ensure(depositAddress.startsWith('tb1'),'Unsupported Lombard Signet address format');
        await boundWallet(provider,input.recipient);
        ensure(!disposed && frozen.expiresAtMs > Date.now(),'Lombard session expired during address verification');
        return {quote:structuredClone(frozen),depositAddress,sourceNetwork:'signet' as const,verifiedAtMs:Date.now(),broadcastAllowed:false as const,recovery:'Lombard redemption to BTC requires LBTC, destination gas, protocol liquidity, and consortium settlement.' as const};
      } finally { signingEnabled = false; running = false; }
    },
  };
}
