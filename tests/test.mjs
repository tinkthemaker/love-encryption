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
// version.js must be evaluated BEFORE crypto.js so that globalThis.CIPHER_VERSION
// is populated for crypto.js to read APP_VERSION from.
const versionSource = readFileSync(join(__dirname, '..', 'version.js'), 'utf-8');
new Function(versionSource)();

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

// --- Share-link round-trip (URL fragment format used for #d=... links) ---
// Mirrors the encode/decode logic in app.js (buildShareLink + consumeShareFragment).
function encodeShareFragment(armored) {
  return btoa(unescape(encodeURIComponent(armored)));
}
function decodeShareFragment(fragment) {
  return decodeURIComponent(escape(atob(fragment)));
}

await test('share-link: #d= fragment round-trips armored ciphertext losslessly', async () => {
  const bundle = await encryptMessage('shared-secret', 'meet at the docks at 8', MIN_KDF_ITERATIONS);
  const armored = formatCiphertext(bundle);
  const fragment = encodeShareFragment(armored);
  // Fragment should be base64 — no spaces, no newlines
  assert.ok(/^[A-Za-z0-9+/=]+$/.test(fragment), 'Fragment must be base64-safe');
  // Decode and verify
  const decoded = decodeShareFragment(fragment);
  assert.equal(decoded, armored);
  // And the recipient can actually decrypt
  const recovered = await decryptMessage('shared-secret', parseCiphertext(decoded));
  assert.equal(recovered, 'meet at the docks at 8');
});

await test('share-link: encoded fragment is URL-safe (no #, no spaces)', () => {
  const armored = '-----BEGIN SECRET MESSAGE-----\nABC=\n-----END SECRET MESSAGE-----';
  const frag = encodeShareFragment(armored);
  assert.ok(!frag.includes('#'), 'No # in fragment');
  assert.ok(!frag.includes(' '), 'No spaces in fragment');
  assert.ok(!frag.includes('\n'), 'No newlines in fragment');
});

await test('share-link: handles unicode messages in fragment', async () => {
  const bundle = await encryptMessage('p', 'I love you \u2764\ufe0f', MIN_KDF_ITERATIONS);
  const armored = formatCiphertext(bundle);
  const decoded = decodeShareFragment(encodeShareFragment(armored));
  assert.equal(await decryptMessage('p', parseCiphertext(decoded)), 'I love you \u2764\ufe0f');
});

// --- QR code generation: matrix dimensions and scan round-trip ---
// Loads the vendored qrcode.js to confirm the integration works.
let CipherQR;
try {
  const qrSource = readFileSync(join(__dirname, '..', 'vendor', 'qrcode.js'), 'utf-8');
  // qrcode.js is UMD: when `module.exports` is settable, it writes the
  // factory there. Run the source in a sandbox and read what it exports.
  const fakeModule = { exports: {} };
  new Function('module', 'exports', qrSource)(fakeModule, fakeModule.exports);
  CipherQR = fakeModule.exports;
} catch (e) {
  CipherQR = null;
}

await test('qrcode: generates a square matrix for a short payload', () => {
  if (!CipherQR) {
    console.log('    (skipped — qrcode.js not loadable)');
    return;
  }
  const qr = CipherQR(0, 'L');
  qr.addData('hello');
  qr.make();
  const n = qr.getModuleCount();
  assert.ok(n >= 21 && n <= 57, `Unexpected module count: ${n}`);
  // Should have at least some dark modules
  let darks = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) darks++;
    }
  }
  assert.ok(darks > n * n * 0.2, `Too few dark modules: ${darks}`);
});

await test('qrcode: handles a realistic share-link payload length', () => {
  if (!CipherQR) {
    console.log('    (skipped — qrcode.js not loadable)');
    return;
  }
  // Simulate a full encrypted message + base64 fragment
  const fakeShareUrl = 'https://love-encryption.vercel.app/#d=' + 'A'.repeat(400);
  const qr = CipherQR(0, 'L');
  qr.addData(fakeShareUrl);
  qr.make();
  const n = qr.getModuleCount();
  // A 400-char URL should land somewhere in v5-v15 territory
  assert.ok(n >= 37 && n <= 77, `Realistic URL produced unexpected size v${(n - 17) / 4}`);
});

// --- Reply-flow round-trip: decrypt then re-encrypt with same passphrase ---
// Models the user flow: receive a message, decrypt it, hit Reply, send a response.
await test('reply flow: decrypted message can be re-encrypted as a reply', async () => {
  // Alice's original message
  const aliceBundle = await encryptMessage('shared-secret', 'meet at the docks', MIN_KDF_ITERATIONS);
  const aliceArmored = formatCiphertext(aliceBundle);
  // Bob decrypts (the session passphrase is "shared-secret")
  const decrypted = await decryptMessage('shared-secret', parseCiphertext(aliceArmored));
  assert.equal(decrypted, 'meet at the docks');
  // Bob types a reply. The Reply button prefills both fields, but Bob
  // edits the message to "see you at 9"
  const replyText = 'see you at 9';
  // Bob re-encrypts with the same shared secret
  const bobBundle = await encryptMessage('shared-secret', replyText, MIN_KDF_ITERATIONS);
  const bobArmored = formatCiphertext(bobBundle);
  // Alice decrypts Bob's reply
  const aliceSees = await decryptMessage('shared-secret', parseCiphertext(bobArmored));
  assert.equal(aliceSees, replyText);
});

await test('reply flow: re-encrypt produces a different ciphertext than original', async () => {
  const a = await encryptMessage('p', 'see you at 9', MIN_KDF_ITERATIONS);
  const b = await encryptMessage('p', 'see you at 9', MIN_KDF_ITERATIONS);
  // Different IV/salt each time, so the armored blocks must differ
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.ct, b.ct);
  assert.notEqual(formatCiphertext(a), formatCiphertext(b));
});

// --- Diceware passphrase generator (the Generate button) ---
// Load the wordlist and run a Node-side mirror of generatePassphrase.
let EFF_DICEWARE_SHORT;
try {
  const wlSource = readFileSync(join(__dirname, '..', 'vendor', 'wordlist.js'), 'utf-8');
  const fakeWl = { exports: {} };
  new Function('module', 'exports', wlSource)(fakeWl, fakeWl.exports);
  EFF_DICEWARE_SHORT = fakeWl.exports;
} catch (e) {
  EFF_DICEWARE_SHORT = null;
}

function generatePassphrase(wordCount = 4) {
  const list = EFF_DICEWARE_SHORT;
  if (!list || !Array.isArray(list) || list.length === 0) {
    throw new Error('Word list not loaded');
  }
  const max = list.length;
  const words = [];
  const buf = new Uint16Array(wordCount);
  crypto.getRandomValues(buf);
  for (let i = 0; i < wordCount; i++) {
    let n = buf[i];
    while (n >= 50 * max) {
      const r = new Uint16Array(1);
      crypto.getRandomValues(r);
      n = r[0];
    }
    words.push(list[n % max]);
  }
  return words.join('-');
}

await test('wordlist: loads 1296 EFF Diceware words', () => {
  if (!EFF_DICEWARE_SHORT) {
    console.log('    (skipped — wordlist.js not loadable)');
    return;
  }
  assert.equal(EFF_DICEWARE_SHORT.length, 1296);
  // Every entry should be lowercase letters (one is "yo-yo")
  for (const w of EFF_DICEWARE_SHORT) {
    assert.ok(/^[a-z][a-z-]*[a-z]$/.test(w), `Bad word: ${w}`);
  }
});

await test('generatePassphrase: produces 4 hyphen-separated words', () => {
  if (!EFF_DICEWARE_SHORT) {
    console.log('    (skipped — wordlist.js not loadable)');
    return;
  }
  const pass = generatePassphrase(4);
  const parts = pass.split('-');
  assert.equal(parts.length, 4, `Expected 4 parts, got ${parts.length}: ${pass}`);
  for (const w of parts) {
    assert.ok(EFF_DICEWARE_SHORT.includes(w), `${w} not in wordlist`);
  }
});

await test('generatePassphrase: each call produces a different passphrase', () => {
  if (!EFF_DICEWARE_SHORT) {
    console.log('    (skipped — wordlist.js not loadable)');
    return;
  }
  // Statistical: 1000 calls, expect no collisions
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    seen.add(generatePassphrase(4));
  }
  assert.equal(seen.size, 1000, 'Got a duplicate in 1000 generations (extremely unlikely with 4 words from 1296)');
});

await test('generatePassphrase: custom wordCount', () => {
  if (!EFF_DICEWARE_SHORT) {
    console.log('    (skipped — wordlist.js not loadable)');
    return;
  }
  const pass = generatePassphrase(5);
  assert.equal(pass.split('-').length, 5);
  const pass2 = generatePassphrase(6);
  assert.equal(pass2.split('-').length, 6);
});

await test('generatePassphrase: a generated passphrase encrypts and decrypts', async () => {
  if (!EFF_DICEWARE_SHORT) {
    console.log('    (skipped — wordlist.js not loadable)');
    return;
  }
  const pass = generatePassphrase(4);
  const bundle = await encryptMessage(pass, 'top secret note', MIN_KDF_ITERATIONS);
  const armored = formatCiphertext(bundle);
  const recovered = await decryptMessage(pass, parseCiphertext(armored));
  assert.equal(recovered, 'top secret note');
});

// --- QR button visibility (regression guard for share-btn class bleed) ---
// Background: the QR button previously had class="btn share-btn", which
// caused the CSS rule `.no-share-api .share-btn { display: none }` to hide
// it in any browser that lacks navigator.share (e.g. some embedded
// WebViews, headless test environments). The fix is to drop the share-btn
// class from the QR button — it should always be visible when shown.
const indexHtml = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
await test('QR button does not have share-btn class (visible regardless of Web Share API)', () => {
  const m = indexHtml.match(/<button id="resultQrBtn"([^>]*)>/);
  assert.ok(m, 'QR button should exist in index.html');
  assert.ok(!m[1].includes('share-btn'), 'QR button must not have share-btn class (would be hidden in browsers without navigator.share)');
});
await test('Share button retains share-btn class (hidden only when navigator.share is unavailable)', () => {
  const m = indexHtml.match(/<button id="resultShareBtn"([^>]*)>/);
  assert.ok(m, 'Share button should exist in index.html');
  assert.ok(m[1].includes('share-btn'), 'Share button must keep share-btn class so the .no-share-api CSS rule hides it correctly');
});

// --- Share button order in the result modal ---
// The order encodes the recommended share path:
//   1. Copy    (armored block — primary, works in any messenger)
//   2. Link    (#d=... URL — one-tap open for B, but auto-linkifies
//                    in some messengers and exposes the link in previews)
//   3. Share   (system share sheet — fine, OS-mediated)
//   4. QR      (in-person handoff only — should be visually last and
//                    de-emphasized, because B scanning their own screen
//                    is not a real use case)
await test('Share button order: Copy, Link, Share, QR (armored block primary, QR in-person only)', () => {
  const actionDiv = indexHtml.match(/<div class="result-actions">([\s\S]*?)<\/div>/);
  assert.ok(actionDiv, 'result-actions div should exist in index.html');
  const ids = [];
  const btnRe = /<button id="(result\w+?)"/g;
  let m;
  while ((m = btnRe.exec(actionDiv[1])) !== null) ids.push(m[1]);
  assert.deepEqual(ids, ['resultCopyBtn', 'resultLinkBtn', 'resultShareBtn', 'resultQrBtn'],
    `Expected [Copy, Link, Share, QR] order, got [${ids.join(', ')}]`);
});

await test('QR button is labeled "QR (in person)" to clarify its scope', () => {
  const m = indexHtml.match(/<button id="resultQrBtn"([^>]*)>([^<]*)<\/button>/);
  assert.ok(m, 'QR button should exist in index.html');
  assert.match(m[2], /in person/i, 'QR button label should mention "in person" to clarify its use case');
});

await test('QR canvas caption clarifies in-person use', () => {
  const m = indexHtml.match(/<p class="result-qr-caption">([^<]*)<\/p>/);
  assert.ok(m, 'QR caption should exist in index.html');
  assert.match(m[1], /in person/i, 'QR canvas caption should mention "in person"');
});

await test('QR button has qr-btn class for visual de-emphasis', () => {
  const m = indexHtml.match(/<button id="resultQrBtn"([^>]*)>/);
  assert.ok(m, 'QR button should exist in index.html');
  assert.ok(m[1].includes('qr-btn'), 'QR button should have qr-btn class so it gets the smaller, muted styling');
});

// --- mobile-web-app-capable meta tag (T2.2) ---
// Background: browser console shows a deprecation warning for
// apple-mobile-web-app-capable. The modern equivalent is
// mobile-web-app-capable. Both are kept for compatibility.
await test('index.html declares both apple-mobile-web-app-capable and mobile-web-app-capable meta tags', () => {
  assert.ok(/<meta\s+name="apple-mobile-web-app-capable"/.test(indexHtml),
    'apple-mobile-web-app-capable meta tag should be present');
  assert.ok(/<meta\s+name="mobile-web-app-capable"/.test(indexHtml),
    'mobile-web-app-capable meta tag should be present');
});

// Summary
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);