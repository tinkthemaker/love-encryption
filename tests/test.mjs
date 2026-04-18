/**
 * CIPHER Crypto Tests
 * Run with: node tests/test.mjs  (requires Node.js 18+)
 */
import assert from 'node:assert/strict';

// --- Core crypto functions replicated from app.js ---
// These must stay in sync with the implementations in app.js.

const enc = new TextEncoder();
const dec = new TextDecoder();

const APP_VERSION = 2;
const KDF_ITERATIONS = 310000;
const MIN_KDF_ITERATIONS = 100000;

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

const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

function formatCiphertext(bundle) {
  const jsonString = JSON.stringify(bundle);
  const base64String = btoa(jsonString);
  const lines = base64String.match(/.{1,64}/g) || [];
  return `-----BEGIN SECRET MESSAGE-----\n${lines.join('\n')}\n-----END SECRET MESSAGE-----`;
}

function parseCiphertext(armoredText) {
  const trimmed = armoredText.trim();
  if (
    !trimmed.includes('-----BEGIN SECRET MESSAGE-----') ||
    !trimmed.includes('-----END SECRET MESSAGE-----')
  ) {
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

async function deriveKey(pass, salt, iterations) {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Uses MIN_KDF_ITERATIONS so the test suite completes in reasonable time.
async function encryptFast(pass, plaintext) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await deriveKey(pass, salt, MIN_KDF_ITERATIONS);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext),
  );
  return {
    v: APP_VERSION,
    alg: 'AES-GCM-256/PBKDF2-SHA256',
    iv: b64.to(iv),
    salt: b64.to(salt),
    iters: MIN_KDF_ITERATIONS,
    ct: b64.to(ct),
  };
}

async function decryptMessage(pass, bundle) {
  const iv = b64.from(bundle.iv);
  const salt = b64.from(bundle.salt);
  const iterations = Number(bundle.iters || KDF_ITERATIONS);
  if (iterations < MIN_KDF_ITERATIONS) {
    throw new Error('Security parameters below acceptable threshold');
  }
  const key = await deriveKey(pass, salt, iterations);
  const ptBuf = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, b64.from(bundle.ct),
  );
  return dec.decode(ptBuf);
}

// --- Test runner ---
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// --- Tests ---
console.log('\nCIPHER Crypto Tests\n');

await test('round-trip: encrypts and decrypts ASCII message', async () => {
  const bundle = await encryptFast('mysecret', 'hello world');
  assert.equal(await decryptMessage('mysecret', bundle), 'hello world');
});

await test('round-trip: preserves unicode, emoji, and accented characters', async () => {
  const msg = '你好世界 \uD83D\uDD10 \u00E9l\u00E8ve caf\u00E9';
  const bundle = await encryptFast('pass', msg);
  assert.equal(await decryptMessage('pass', bundle), msg);
});

await test('round-trip: works with an empty string message', async () => {
  const bundle = await encryptFast('pass', '');
  assert.equal(await decryptMessage('pass', bundle), '');
});

await test('round-trip: works with a very long message', async () => {
  const msg = 'A'.repeat(50000);
  const bundle = await encryptFast('pass', msg);
  assert.equal(await decryptMessage('pass', bundle), msg);
});

await test('wrong passphrase fails decryption', async () => {
  const bundle = await encryptFast('correct', 'secret');
  await assert.rejects(() => decryptMessage('wrong', bundle));
});

await test('each encryption produces unique IV, salt, and ciphertext', async () => {
  const a = await encryptFast('pass', 'same message');
  const b = await encryptFast('pass', 'same message');
  assert.notEqual(a.ct, b.ct);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.salt, b.salt);
});

await test('iteration count below minimum is rejected', async () => {
  const bundle = await encryptFast('pass', 'msg');
  bundle.iters = MIN_KDF_ITERATIONS - 1;
  await assert.rejects(
    () => decryptMessage('pass', bundle),
    /Security parameters below acceptable threshold/,
  );
});

await test('iteration count at exact minimum is accepted', async () => {
  const bundle = await encryptFast('pass', 'msg');
  bundle.iters = MIN_KDF_ITERATIONS;
  assert.equal(await decryptMessage('pass', bundle), 'msg');
});

await test('parseCiphertext: rejects text with no armor headers', () => {
  assert.throws(() => parseCiphertext('no headers here'), /Invalid message format/);
});

await test('parseCiphertext: rejects partial armor (missing end header)', () => {
  assert.throws(
    () => parseCiphertext('-----BEGIN SECRET MESSAGE-----\ndata'),
    /Invalid message format/,
  );
});

await test('parseCiphertext: rejects empty content between headers', () => {
  assert.throws(
    () => parseCiphertext('-----BEGIN SECRET MESSAGE-----\n-----END SECRET MESSAGE-----'),
    /Empty message content/,
  );
});

await test('parseCiphertext: rejects bundle missing required fields', () => {
  const bad = btoa(JSON.stringify({ v: 2, alg: 'test' }));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
    /Missing required encryption data/,
  );
});

await test('parseCiphertext: rejects bundle where iv/salt/ct are not strings', () => {
  const bad = btoa(JSON.stringify({ iv: 123, salt: null, ct: [] }));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
    /Missing required encryption data/,
  );
});

await test('parseCiphertext: rejects non-object JSON payloads', () => {
  const bad = btoa(JSON.stringify([1, 2, 3]));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
    /Invalid encryption data/,
  );
});

await test('parseCiphertext: rejects non-finite iters value', () => {
  const bad = btoa(JSON.stringify({ iv: 'a', salt: 'b', ct: 'c', iters: Infinity }));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
    /Invalid iteration count/,
  );
});

await test('parseCiphertext: rejects negative iters value', () => {
  const bad = btoa(JSON.stringify({ iv: 'a', salt: 'b', ct: 'c', iters: -1 }));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
    /Invalid iteration count/,
  );
});

await test('parseCiphertext: rejects non-base64 content', () => {
  assert.throws(
    () => parseCiphertext('-----BEGIN SECRET MESSAGE-----\n!!!notbase64!!!\n-----END SECRET MESSAGE-----'),
  );
});

await test('formatCiphertext: output starts and ends with correct headers', () => {
  const armored = formatCiphertext({ v: 2, iv: 'a', salt: 'b', ct: 'c' });
  assert.ok(armored.startsWith('-----BEGIN SECRET MESSAGE-----'));
  assert.ok(armored.endsWith('-----END SECRET MESSAGE-----'));
});

await test('formatCiphertext: wraps lines at 64 characters', () => {
  const bundle = { v: 2, alg: 'AES-GCM-256/PBKDF2-SHA256', iv: 'a'.repeat(20), salt: 'b'.repeat(20), ct: 'c'.repeat(200) };
  const armored = formatCiphertext(bundle);
  const bodyLines = armored.split('\n').slice(1, -1);
  for (const line of bodyLines) {
    assert.ok(line.length <= 64, `Line too long: ${line.length} chars`);
  }
});

await test('format/parse round-trip is lossless', () => {
  const bundle = { v: 2, alg: 'AES-GCM-256/PBKDF2-SHA256', iv: 'iv==', salt: 'sa==', iters: 310000, ct: 'ct==' };
  assert.deepEqual(parseCiphertext(formatCiphertext(bundle)), bundle);
});

await test('parseCiphertext: handles multiline armor (whitespace stripped)', async () => {
  const bundle = await encryptFast('pass', 'a'.repeat(200));
  const armored = formatCiphertext(bundle);
  const lines = armored.split('\n');
  assert.ok(lines.length > 3, 'Should span multiple lines');
  const reparsed = parseCiphertext(armored);
  assert.equal(await decryptMessage('pass', reparsed), 'a'.repeat(200));
});

// Summary
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
