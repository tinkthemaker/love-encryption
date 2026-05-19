/**
 * CIPHER Crypto Tests
 * Run with: node tests/test.mjs  (requires Node.js 18+)
 *
 * Crypto functions are imported from crypto.js — no duplication.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load and evaluate crypto.js (shared IIFE that assigns to globalThis in Node)
const __dirname = dirname(fileURLToPath(import.meta.url));
const cryptoSource = readFileSync(join(__dirname, '..', 'crypto.js'), 'utf-8');

// crypto.js uses module.exports for Node — eval it to get the exports
const cryptoModule = {};
const moduleProxy = { exports: cryptoModule };
const moduleFactory = new Function('module', 'exports', 'require', cryptoSource);
moduleFactory(moduleProxy, cryptoModule, undefined);

const {
  APP_VERSION, KDF_ITERATIONS, MIN_KDF_ITERATIONS,
  b64, rand, formatCiphertext, parseCiphertext,
  deriveKey, encryptMessage, decryptMessage,
} = moduleProxy.exports;

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
  const bundle = await encryptMessage('mysecret', 'hello world', MIN_KDF_ITERATIONS);
  assert.equal(await decryptMessage('mysecret', bundle), 'hello world');
});

await test('round-trip: preserves unicode, emoji, and accented characters', async () => {
  const msg = '你好世界 \uD83D\uDD10 \u00E9l\u00E8ve caf\u00E9';
  const bundle = await encryptMessage('pass', msg, MIN_KDF_ITERATIONS);
  assert.equal(await decryptMessage('pass', bundle), msg);
});

await test('round-trip: works with an empty string message', async () => {
  const bundle = await encryptMessage('pass', '', MIN_KDF_ITERATIONS);
  assert.equal(await decryptMessage('pass', bundle), '');
});

await test('round-trip: works with a very long message', async () => {
  const msg = 'A'.repeat(50000);
  const bundle = await encryptMessage('pass', msg, MIN_KDF_ITERATIONS);
  assert.equal(await decryptMessage('pass', bundle), msg);
});

await test('wrong passphrase fails decryption', async () => {
  const bundle = await encryptMessage('correct', 'secret', MIN_KDF_ITERATIONS);
  await assert.rejects(() => decryptMessage('wrong', bundle));
});

await test('each encryption produces unique IV, salt, and ciphertext', async () => {
  const a = await encryptMessage('pass', 'same message', MIN_KDF_ITERATIONS);
  const b = await encryptMessage('pass', 'same message', MIN_KDF_ITERATIONS);
  assert.notEqual(a.ct, b.ct);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.salt, b.salt);
});

await test('iteration count below minimum is rejected', async () => {
  const bundle = await encryptMessage('pass', 'msg', MIN_KDF_ITERATIONS);
  bundle.iters = MIN_KDF_ITERATIONS - 1;
  await assert.rejects(
    () => decryptMessage('pass', bundle),
    /Security parameters below acceptable threshold/,
  );
});

await test('iteration count at exact minimum is accepted', async () => {
  const bundle = await encryptMessage('pass', 'msg', MIN_KDF_ITERATIONS);
  bundle.iters = MIN_KDF_ITERATIONS;
  assert.equal(await decryptMessage('pass', bundle), 'msg');
});

await test('iteration count defaults to KDF_ITERATIONS when missing', async () => {
  const bundle = await encryptMessage('pass', 'msg', KDF_ITERATIONS);
  delete bundle.iters;
  // Should still decrypt fine (defaults to KDF_ITERATIONS)
  assert.equal(await decryptMessage('pass', bundle), 'msg');
});

await test('encryptMessage uses correct algorithm identifier', async () => {
  const bundle = await encryptMessage('pass', 'msg', MIN_KDF_ITERATIONS);
  assert.equal(bundle.alg, 'AES-GCM-256/PBKDF2-SHA256');
  assert.equal(bundle.v, APP_VERSION);
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
  const bundle = await encryptMessage('pass', 'a'.repeat(200), MIN_KDF_ITERATIONS);
  const armored = formatCiphertext(bundle);
  const lines = armored.split('\n');
  assert.ok(lines.length > 3, 'Should span multiple lines');
  const reparsed = parseCiphertext(armored);
  assert.equal(await decryptMessage('pass', reparsed), 'a'.repeat(200));
});

// Summary
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);