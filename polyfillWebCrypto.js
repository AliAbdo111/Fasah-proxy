/**
 * MongoDB Node driver uses `globalThis.crypto.getRandomValues` (see mongodb/lib/utils.js uuidV4).
 * Polyfill from Node's built-in Web Crypto when missing (avoids ReferenceError: crypto is not defined).
 */
'use strict';

try {
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
    const { webcrypto } = require('node:crypto');
    globalThis.crypto = webcrypto;
  }
} catch (_) {
  /* Node without webcrypto: mongoose/mongodb will fail with a follow-up error */
}
