import type { BabylonContext, BabylonParameters, FinalityProvider, VerifiedUtxo } from './types.js';
import { SIGNET_GENESIS } from './types.js';
import { checkContext, ensure, hex, integer } from './validation.js';

export const BABYLON_API = 'https://staking-api.testnet.babylonlabs.io';
export const BABYLON_LCD = 'https://babylon-testnet-api.polkachu.com';
export const SIGNET_API = 'https://mempool.space/signet/api';
type Json = Record<string, any>;
async function get(url: string, asText = false): Promise<any> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12_000), headers: { Accept: asText ? 'text/plain' : 'application/json' } });
  ensure(response.ok, `Public network read failed (${response.status}): ${url}`);
  const body = await response.text();
  ensure(body.length < 2_000_000, 'Public network response exceeds limit');
  return asText ? body : JSON.parse(body);
}
export function parseBabylonParameters(raw: unknown): BabylonParameters[] {
  ensure(Array.isArray(raw) && raw.length > 0 && raw.length <= 100, 'Missing versioned Babylon parameters');
  const versions = new Set<number>();
  return raw.map((p: Json) => {
    const version = integer(p.version, 'parameter version');
    ensure(!versions.has(version), 'Duplicate parameter version'); versions.add(version);
    ensure(Array.isArray(p.covenant_pks) && p.covenant_pks.length > 0 && p.covenant_pks.length <= 100, 'Invalid covenant committee');
    const keys = p.covenant_pks.map((k: unknown) => hex(k, 32, 'covenant key'));
    ensure(new Set(keys).size === keys.length, 'Duplicate covenant keys');
    const slashingRate = Number(p.slashing_rate);
    ensure(typeof p.slashing_rate === 'string' && /^0\.\d+$/.test(p.slashing_rate) && slashingRate > 0 && slashingRate < 1, 'Invalid slashing rate');
    ensure(typeof p.slashing_pk_script === 'string' && /^(?:[a-f0-9]{2})+$/.test(p.slashing_pk_script), 'Invalid slashing script');
    const result: BabylonParameters = {
      version, btcActivationHeight: integer(p.btc_activation_height, 'activation height'),
      covenantNoCoordPks: keys, covenantQuorum: integer(p.covenant_quorum, 'covenant quorum', 1, keys.length),
      minStakingAmountSat: integer(p.min_staking_value_sat, 'minimum stake', 1, 2_100_000_000_000_000),
      maxStakingAmountSat: integer(p.max_staking_value_sat, 'maximum stake', 1, 2_100_000_000_000_000),
      minStakingTimeBlocks: integer(p.min_staking_time_blocks, 'minimum lock', 1, 65535),
      maxStakingTimeBlocks: integer(p.max_staking_time_blocks, 'maximum lock', 1, 65535),
      unbondingTime: integer(p.unbonding_time_blocks, 'unbonding time', 1, 65535),
      unbondingFeeSat: integer(p.unbonding_fee_sat, 'unbonding fee', 1),
      slashing: { slashingPkScriptHex: p.slashing_pk_script, slashingRate, minSlashingTxFeeSat: integer(p.min_slashing_tx_fee_sat, 'slashing fee', 1) },
    };
    ensure(result.minStakingAmountSat <= result.maxStakingAmountSat && result.minStakingTimeBlocks <= result.maxStakingTimeBlocks, 'Inverted Babylon bounds');
    return result;
  }).sort((a,b) => a.btcActivationHeight - b.btcActivationHeight || a.version - b.version);
}
export async function fetchBabylonSignetContext(): Promise<BabylonContext> {
  const [node, info, lightClient, genesis, tip, providers, lcdParams] = await Promise.all([
    get(`${BABYLON_LCD}/cosmos/base/tendermint/v1beta1/node_info`), get(`${BABYLON_API}/v2/network-info`),
    get(`${BABYLON_LCD}/babylon/btclightclient/v1/tip`), get(`${SIGNET_API}/block-height/0`, true),
    get(`${SIGNET_API}/blocks/tip/height`, true), get(`${BABYLON_API}/v2/finality-providers`),
    get(`${BABYLON_LCD}/babylon/btcstaking/v1/params`),
  ]);
  ensure(node.default_node_info?.network === 'bbn-test-6' && genesis.trim() === SIGNET_GENESIS, 'Official endpoint chain identity changed');
  const parameters = parseBabylonParameters(info.data?.params?.bbn);
  const latest = parameters.at(-1)!;
  const lcd = lcdParams.params;
  ensure(lcd && integer(lcd.btc_activation_height, 'LCD activation') === latest.btcActivationHeight && JSON.stringify(lcd.covenant_pks) === JSON.stringify(latest.covenantNoCoordPks) && integer(lcd.covenant_quorum, 'LCD quorum') === latest.covenantQuorum && integer(lcd.min_staking_value_sat, 'LCD minimum') === latest.minStakingAmountSat && integer(lcd.max_staking_value_sat, 'LCD maximum') === latest.maxStakingAmountSat && integer(lcd.unbonding_time_blocks, 'LCD unbonding') === latest.unbondingTime && integer(lcd.unbonding_fee_sat, 'LCD fee') === latest.unbondingFeeSat, 'Babylon API and chain parameters disagree');
  const slashHex = Array.from(atob(lcd.slashing_pk_script), c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  ensure(integer(lcd.min_staking_time_blocks, 'LCD minimum lock') === latest.minStakingTimeBlocks && integer(lcd.max_staking_time_blocks, 'LCD maximum lock') === latest.maxStakingTimeBlocks && integer(lcd.min_slashing_tx_fee_sat, 'LCD slashing fee') === latest.slashing.minSlashingTxFeeSat && Number(lcd.slashing_rate) === latest.slashing.slashingRate && slashHex === latest.slashing.slashingPkScriptHex, 'Babylon API and chain slashing or lock parameters disagree');
  ensure(Array.isArray(providers.data), 'Finality provider discovery unavailable');
  const finalityProviders: FinalityProvider[] = providers.data.map((p: Json) => ({ publicKey: hex(p.btc_pk, 32, 'provider key'), name: String(p.description?.moniker ?? '').slice(0,120), status: p.state === 'FINALITY_PROVIDER_STATUS_ACTIVE' ? 'active' : 'inactive', commission: String(p.commission) }));
  const context: BabylonContext = { network: 'signet', genesisHash: SIGNET_GENESIS, babylonChainId: 'bbn-test-6', bitcoinTipHeight: integer(tip.trim(), 'Bitcoin tip'), babylonBitcoinTipHeight: integer(lightClient.header?.height, 'Babylon light client tip'), fetchedAtMs: Date.now(), parameterSource: `${BABYLON_API}/v2/network-info`, parameters, finalityProviders, minimumStakingConfirmations: integer(info.data?.params?.btc?.at(-1)?.btc_confirmation_depth, 'confirmation depth', 1) };
  checkContext(context);
  return context;
}
/** Public Signet reads only. No wallet address or UTXO list is written to reports. */
export async function fetchSignetUtxos(address: string): Promise<VerifiedUtxo[]> {
  const { address: btcAddress, networks } = await import('bitcoinjs-lib');
  btcAddress.toOutputScript(address, networks.testnet);
  const list = await get(`${SIGNET_API}/address/${encodeURIComponent(address)}/utxo`);
  ensure(Array.isArray(list) && list.length <= 100, 'UTXO response is invalid or too large');
  const confirmed = list.filter((u: Json) => u.status?.confirmed === true).slice(0, 20);
  return Promise.all(confirmed.map(async (u: Json) => {
    const txid = hex(u.txid, 32, 'UTXO transaction');
    return { txid, vout: integer(u.vout, 'UTXO index'), valueSat: integer(u.value, 'UTXO value', 1), scriptPubKey: btcAddress.toOutputScript(address, networks.testnet).toString('hex'), rawTransactionHex: (await get(`${SIGNET_API}/tx/${txid}/hex`, true)).trim(), confirmedHeight: integer(u.status.block_height, 'UTXO confirmation height', 1) };
  }));
}
