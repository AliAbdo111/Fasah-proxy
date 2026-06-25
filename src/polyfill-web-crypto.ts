/**
 * Mongoose / MongoDB driver may use globalThis.crypto (Web Crypto API).
 */
import nodeCrypto from 'crypto';

if (typeof globalThis.crypto === 'undefined' && nodeCrypto.webcrypto) {
  globalThis.crypto = nodeCrypto.webcrypto as Crypto;
}

module.exports = globalThis.crypto;
