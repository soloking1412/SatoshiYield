const { generateSecretKey } = require('@stacks/auth');

const mnemonic = 'holiday scatter legal caution width truck swap assist gym example table immense';
const secretKey = generateSecretKey(mnemonic);

console.log('Private Key:', secretKey);
