import bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';

const mnemonic = 'holiday scatter legal caution width truck swap assist gym example table immense';

const seed = bip39.mnemonicToSeedSync(mnemonic);
const derived = derivePath("m/44'/5757'/0'/0/0", seed.toString('hex'));
const privateKey = '0x' + Buffer.from(derived.key).toString('hex') + '01';

console.log('Private Key:', privateKey);
