/**
 * CIPHER — Shared Crypto Module
 * Core cryptographic primitives used by both app.js and the test suite.
 * Any change to encryption parameters or algorithms MUST be made here
 * so that tests and the app stay in sync.
 */

const APP_VERSION = 2;
const KDF_ITERATIONS = 310000;
const MIN_KDF_ITERATIONS = 100000;
const DEBOUNCE_DELAY = 150;

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Safe Base64 encoding/decoding that handles large buffers.
 * Avoids stack overflow from spread operator on large arrays.
 */
const b64 = {
  to: buf => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },
  from: str => Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer,
};

const rand = n => crypto.getRandomValues(new Uint8Array(n));

/**
 * Formats an encrypted bundle into an armored text block.
 * @param {object} bundle The encrypted data object.
 * @returns {string} The formatted ciphertext string.
 */
function formatCiphertext(bundle) {
  const jsonString = JSON.stringify(bundle);
  const base64String = btoa(jsonString);
  const lines = base64String.match(/.{1,64}/g) || [];
  return `-----BEGIN SECRET MESSAGE-----\n${lines.join('\n')}\n-----END SECRET MESSAGE-----`;
}

/**
 * Parses an armored text block back into an object.
 * @param {string} armoredText The formatted ciphertext.
 * @returns {object} The parsed encrypted data object.
 * @throws {Error} If the ciphertext format is invalid.
 */
function parseCiphertext(armoredText) {
  const trimmed = armoredText.trim();
  if (!trimmed.includes('-----BEGIN SECRET MESSAGE-----') ||
      !trimmed.includes('-----END SECRET MESSAGE-----')) {
    throw new Error('Invalid message format');
  }
  const base64String = trimmed
    .replace('-----BEGIN SECRET MESSAGE-----', '')
    .replace('-----END SECRET MESSAGE-----', '')
    .replace(/\s/g, '');
  if (!base64String) {
    throw new Error('Empty message content');
  }
  const jsonString = atob(base64String);
  const bundle = JSON.parse(jsonString);
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
    throw new Error('Invalid encryption data');
  }
  if (typeof bundle.iv !== 'string' || !bundle.iv ||
      typeof bundle.salt !== 'string' || !bundle.salt ||
      typeof bundle.ct !== 'string' || !bundle.ct) {
    throw new Error('Missing required encryption data');
  }
  if (bundle.iters !== undefined && (typeof bundle.iters !== 'number' || bundle.iters <= 0 || !Number.isFinite(bundle.iters))) {
    throw new Error('Invalid iteration count in message');
  }
  return bundle;
}

/**
 * Derives a cryptographic key from a password and salt.
 * @param {string} pass The user's password.
 * @param {Uint8Array} salt A random salt.
 * @param {number} iterations The number of PBKDF2 iterations.
 * @returns {Promise<CryptoKey>} The derived AES-GCM key.
 */
async function deriveKey(pass, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext message with a password.
 * @param {string} pass The user's password.
 * @param {string} plaintext The message to encrypt.
 * @param {number} [iterations=KDF_ITERATIONS] Override iteration count (for tests).
 * @returns {Promise<object>} An object containing the encrypted data and parameters.
 */
async function encryptMessage(pass, plaintext, iterations = KDF_ITERATIONS) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await deriveKey(pass, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return {
    v: APP_VERSION,
    alg: 'AES-GCM-256/PBKDF2-SHA256',
    iv: b64.to(iv),
    salt: b64.to(salt),
    iters: iterations,
    ct: b64.to(ct),
  };
}

/**
 * Decrypts a bundle of encrypted data with a password.
 * @param {string} pass The user's password.
 * @param {object} bundle The encrypted data bundle.
 * @returns {Promise<string>} The decrypted plaintext message.
 * @throws {Error} If iterations count is below minimum threshold.
 */
async function decryptMessage(pass, bundle) {
  const iv = b64.from(bundle.iv);
  const salt = b64.from(bundle.salt);
  const iterations = Number(bundle.iters || KDF_ITERATIONS);
  // Prevent downgrade attacks by enforcing minimum iterations
  if (iterations < MIN_KDF_ITERATIONS) {
    throw new Error('Security parameters below acceptable threshold');
  }
  const key = await deriveKey(pass, salt, iterations);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64.from(bundle.ct));
  return dec.decode(ptBuf);
}

// Export for browsers (window.CipherCrypto) and Node.js (module.exports)
const CipherCrypto = {
  APP_VERSION, KDF_ITERATIONS, MIN_KDF_ITERATIONS, DEBOUNCE_DELAY,
  enc, dec, b64, rand,
  formatCiphertext, parseCiphertext, deriveKey, encryptMessage, decryptMessage,
};

if (typeof window !== 'undefined') {
  window.CipherCrypto = CipherCrypto;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CipherCrypto;
}