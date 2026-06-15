# CIPHER — Implementation Plan

**Repo:** [tinkthemaker/love-encryption](https://github.com/tinkthemaker/love-encryption)
**Live:** https://love-encryption.vercel.app
**Local clone:** `E:\AI backups\love-encryption\`
**Audit date:** 2026-06-14
**Audited against:** commit `c655a75` on `main`

---

## How to read this plan

Each item is a **discrete unit of work** that can ship as one commit. Items are
ordered by **dependency**, not by effort. The plan is designed to be executed
top-to-bottom by a coding agent: do A, verify A's tests, then move to B.

Every item has:

- **Acceptance criteria** — mechanical checks that prove the work is done
- **Files to touch** — exact paths the agent should edit
- **Test additions** — what the agent must add to `tests/test.mjs`

A coding agent should treat the **Acceptance criteria** as the gate. If a
test fails or a check is wrong, the item is not done.

---

## Status baseline (what already exists)

- **Crypto:** AES-256-GCM, PBKDF2-SHA256 @ 310k iters, 16-byte salt, 12-byte IV,
  minimum 100k iters enforced on decrypt.
- **UI:** encrypt/decrypt tabs, passphrase strength meter, diceware generator,
  result modal with **Copy / Link / Share / QR (in person)** buttons in that
  order (armored block is the primary share path, QR is the visually
  de-emphasized in-person handoff option), `#d=...` URL fragment load,
  auto-clear plaintext, friendlier error copy, auto-suggest.
- **PWA:** service worker with stale-while-revalidate, manifest, two heart icons.
- **Vendored libs:** `vendor/qrcode.js` (MIT, kazuhikoarase),
  `vendor/wordlist.js` (EFF Diceware short, CC BY 3.0).
- **Tests:** 41/41 passing in `node tests/test.mjs` (Node 18+).

---

## Tier 1 — Repo hygiene (no behavior change)

### T1.1 · Add `LICENSE` file (MIT)

**Goal:** Repo has a license so others can legally reuse the code.

**Files to touch:**
- Create `LICENSE` at repo root with the standard MIT text
  (Copyright (c) 2026 Tink — exact year optional, "Tink" or "tinkthemaker"
  is fine — pick what matches the GitHub profile)

**Acceptance criteria:**
- [ ] `LICENSE` exists at `E:\AI backups\love-encryption\LICENSE`
- [ ] First line contains the word "MIT License"
- [ ] Contains a copyright line
- [ ] `git status` shows it as a new file

**Tests:** None needed.

---

### T1.2 · Add `package.json`

**Goal:** Make the test/serve scripts discoverable via `npm test` /
`npm run serve`; document Node version requirement.

**Files to touch:**
- Create `package.json` at repo root with this exact content:

```json
{
  "name": "love-encryption",
  "version": "3.0.0",
  "private": true,
  "description": "Secure client-side message encryption using AES-256-GCM.",
  "type": "module",
  "scripts": {
    "test": "node tests/test.mjs",
    "serve": "python -m http.server 8000"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": [
    "encryption",
    "aes-gcm",
    "pwa",
    "privacy",
    "client-side",
    "webcrypto"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/tinkthemaker/love-encryption.git"
  },
  "homepage": "https://love-encryption.vercel.app"
}
```

Note: `"type": "module"` is set even though no `.mjs` is needed — it's
harmless and documents intent. `"private": true` prevents accidental
publishing.

**Acceptance criteria:**
- [ ] `package.json` exists at repo root
- [ ] `npm test` runs the test suite and reports 35/35 passing
- [ ] `npm run serve` starts `python -m http.server 8000`
- [ ] File is valid JSON (`node -e "JSON.parse(require('fs').readFileSync('package.json','utf-8'))"` exits 0)

**Tests:** None needed.

---

### T1.3 · Centralize `APP_VERSION` in a single source

**Goal:** Fix the cache-vs-version drift problem properly (T1.3 in the
original plan). `APP_VERSION` is currently in `crypto.js` and `CACHE_NAME`
is hard-coded as `'cipher-v3'` in `service-worker.js`. When version
bumps, both have to change in lockstep — easy to forget.

**Files to touch:**
- Create `version.js` at repo root:

```js
// CIPHER — single source of truth for the app version.
// Bump this when the app changes in a way that requires a service
// worker cache invalidation.
const APP_VERSION = 3;
const CACHE_NAME = `cipher-v${APP_VERSION}`;

if (typeof window !== 'undefined') {
  window.CIPHER_VERSION = { APP_VERSION, CACHE_NAME };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_VERSION, CACHE_NAME };
}
```

- Edit `crypto.js`:
  - Remove the line `const APP_VERSION = 2;` (around line 8)
  - Remove `APP_VERSION` from the `CipherCrypto` export object (around line 143)
  - The constant must come from `version.js`. Two options:
    - **(preferred)** add a script tag for `version.js` BEFORE `crypto.js`
      in `index.html`, and read `APP_VERSION` from `window.CIPHER_VERSION`
      at the top of `crypto.js`
    - **or** pass it as a parameter to `encryptMessage` (more invasive)
  - For minimal change: in `crypto.js`, add at the top of the IIFE:
    `const { APP_VERSION } = window.CIPHER_VERSION;`

- Edit `service-worker.js`:
  - Remove `const CACHE_NAME = 'cipher-v3';` (line 2)
  - Add at the top: `importScripts('./version.js');`
  - After importScripts, `CACHE_NAME` is now a global on `self`

- Edit `index.html`:
  - Add `<script src="version.js"></script>` BEFORE `<script src="crypto.js"></script>` (line 125)

- Edit `tests/test.mjs`:
  - Update the loader for `crypto.js` to also set up `window.CIPHER_VERSION`
    from `version.js` (or have crypto.js read from a global set by version.js)
  - All existing tests should still pass with no behavior change

**Acceptance criteria:**
- [ ] `version.js` exists at repo root
- [ ] `crypto.js` no longer has its own `APP_VERSION` definition
- [ ] `service-worker.js` no longer has a hard-coded `CACHE_NAME` string
- [ ] `index.html` includes `version.js` script tag
- [ ] `node tests/test.mjs` → 35/35 passing
- [ ] Bumping `APP_VERSION` in `version.js` (test by changing to 99) does
      NOT require any other source change for the cache name to follow
- [ ] `git diff crypto.js` shows only the import line and the removed
      `APP_VERSION = 2;`

**Tests:** None new (existing tests must still pass).

---

### T1.4 · Add GitHub Actions CI

**Goal:** PRs get a green check from automated test runs. Catches regressions
that would otherwise land on `main`.

**Files to touch:**
- Create `.github/workflows/test.yml`:

```yaml
name: test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm test
```

**Acceptance criteria:**
- [ ] `.github/workflows/test.yml` exists
- [ ] YAML is valid (`python -c "import yaml; yaml.safe_load(open('.github/workflows/test.yml'))"` exits 0)
- [ ] The workflow triggers on `push` and `pull_request` to `main`

**Tests:** None (the workflow itself is the test).

---

### T1.5 · Add `SECURITY.md`

**Goal:** Privacy tools attract security researchers. Give them a private
disclosure channel so bugs don't end up as public GitHub issues.

**Files to touch:**
- Create `SECURITY.md` at repo root with the standard GitHub Security
  Advisories format. Replace `REPLACE_ME` with the user's actual contact
  email (default: `tinkxiu@gmail.com` per the `TinkSoft` memory entry, but
  the agent should ask if uncertain).

```markdown
# Security

If you have discovered a security vulnerability in CIPHER, please report
it privately. **Do not open a public GitHub issue.**

## Reporting a vulnerability

Email: REPLACE_ME
Expected response: within 7 days.

Please include:
- A description of the vulnerability and its impact
- Reproduction steps
- A proof-of-concept (PoC) if possible

## Scope

CIPHER is a client-side message encryption PWA. The cryptographic
implementation lives in `crypto.js`. Anything that would let a third
party recover plaintext from a `-----BEGIN SECRET MESSAGE-----` block
without knowing the passphrase is in scope.
```

**Acceptance criteria:**
- [ ] `SECURITY.md` exists
- [ ] Contains the word "vulnerability" or "security"
- [ ] Does NOT instruct the user to open a public issue for security
      reports

**Tests:** None.

---

## Tier 2 — Production security headers

### T2.1 · Add `vercel.json` with CSP + standard security headers

**Goal:** The live site currently ships with only HSTS. A privacy tool
should not be iframable, should not be MIME-sniffed, and should not leak
referrers. CSP `script-src 'self'` makes the whole site self-contained
(which it already is — no third-party scripts).

**Files to touch:**
- Create `vercel.json` at repo root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Referrer-Policy",
          "value": "no-referrer"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        }
      ]
    }
  ]
}
```

The `style-src 'self' 'unsafe-inline'` is required because the project
has inline `<style>` blocks in the background-effects CSS — verify by
running `grep -c '<style>' index.html` first. If it returns 0, drop
`'unsafe-inline'`.

The existing HSTS header from Vercel defaults will be overridden by this
file (kept in for explicitness so a future Vercel config change doesn't
silently remove it).

**Acceptance criteria:**
- [ ] `vercel.json` exists at repo root
- [ ] Valid JSON (`node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf-8'))"` exits 0)
- [ ] Contains all six security header keys
- [ ] CSP `script-src 'self'` (no `'unsafe-eval'`, no wildcard, no
      `https:`)
- [ ] CSP `frame-ancestors 'none'` (no clickjacking)

**Tests:** None (this is a deploy-time config; CI doesn't run a
preview deploy). Manual verification: after merge, `curl -I
https://love-encryption.vercel.app/` shows all six headers.

---

### T2.2 · Add `mobile-web-app-capable` meta tag

**Goal:** Vercel `curl` of the live HTML shows a deprecation warning in
the browser console:
> `<meta name="apple-mobile-web-app-capable" content="yes">` is
> deprecated. Please include `<meta name="mobile-web-app-capable"
> content="yes">`

`index.html` line 13 has the Apple variant. Add the modern equivalent
alongside it.

**Files to touch:**
- Edit `index.html`:
  - After line 13 (`<meta name="apple-mobile-web-app-capable" content="yes">`),
    add: `<meta name="mobile-web-app-capable" content="yes">`

**Acceptance criteria:**
- [ ] `index.html` contains BOTH `apple-mobile-web-app-capable` and
      `mobile-web-app-capable` meta tags

**Tests:** None (visual check in browser console after deploy).

---

## Tier 3 — User-facing features

### T3.1 · In-app self-test

**Goal:** A paranoid user can verify their browser's WebCrypto works in
~1 second without leaving the page. Doubles as a smoke test after a
browser update.

**Behavior:**
- New "Run self-test" link/button in the footer
- Click → encrypts a known plaintext with a known passphrase, decrypts
  it, verifies match, and reports the KDF time in milliseconds
- On success: status text reads "Self-test passed (KDF took 312ms)"
- On failure: status text reads "Self-test FAILED — your browser's
  WebCrypto may be broken"

**Files to touch:**
- Edit `index.html`:
  - In the `<footer class="footer">` block (around line 96-100), add a
    new `<button id="selfTestBtn" class="footer-link" type="button">Run
    self-test</button>` element. Place it after `<p class="tech-info">`
    and before the closing `</footer>`.
- Edit `app.js`:
  - Add at the top of the DOM selection block (around line 36):
    `const selfTestBtn = $('#selfTestBtn');`
  - Add a new function `runSelfTest()` after `handleGeneratePassphrase()`
    (around line 607):

```js
/**
 * Runs an in-app self-test: encrypts and decrypts a known plaintext,
 * verifies the round-trip, and reports the KDF timing. Builds user
 * confidence that the browser's WebCrypto implementation is working.
 */
async function runSelfTest() {
  const TEST_PASSPHRASE = 'cipher-self-test-' + Date.now();
  const TEST_PLAINTEXT = 'CIPHER self-test vector \u2728';
  try {
    setProcessing(true);
    setStatus('Self-test running\u2026');
    const t0 = performance.now();
    const bundle = await encryptMessage(TEST_PASSPHRASE, TEST_PLAINTEXT);
    const recovered = await decryptMessage(TEST_PASSPHRASE, bundle);
    const elapsed = Math.round(performance.now() - t0);
    if (recovered === TEST_PLAINTEXT) {
      setStatus(`Self-test passed (KDF took ${elapsed}ms)`, 'muted');
    } else {
      setStatus('Self-test FAILED: decrypted text does not match', 'danger');
    }
  } catch (err) {
    setStatus(`Self-test FAILED: ${err.message}`, 'danger');
  } finally {
    setProcessing(false);
  }
}
```

  - In `init()` (around line 705), add the event listener:
    `if (selfTestBtn) selfTestBtn.addEventListener('click', runSelfTest);`

- Edit `style.css`:
  - Add a new rule near the `.footer` block (around line 752):

```css
.footer-link {
  background: none;
  border: none;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  padding: 4px 8px;
  margin-top: 6px;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.footer-link:hover {
  color: var(--text);
}
```

- Edit `tests/test.mjs`:
  - Add at the end of the test list (after the existing "generatePassphrase"
    test, around line 412):

```js
// --- In-app self-test logic (the same encrypt/decrypt pair the button runs) ---
await test('self-test: known vector round-trips through encrypt + decrypt', async () => {
  const TEST_PASSPHRASE = 'self-test-pass';
  const TEST_PLAINTEXT = 'CIPHER self-test vector \u2728';
  const bundle = await encryptMessage(TEST_PASSPHRASE, TEST_PLAINTEXT, MIN_KDF_ITERATIONS);
  const recovered = await decryptMessage(TEST_PASSPHRASE, bundle);
  assert.equal(recovered, TEST_PLAINTEXT);
});
```

**Acceptance criteria:**
- [ ] `index.html` has `<button id="selfTestBtn">` in the footer
- [ ] `app.js` has `runSelfTest()` function defined
- [ ] `app.js` wires up the click listener in `init()`
- [ ] `style.css` has `.footer-link` styles
- [ ] `node tests/test.mjs` → 36/36 passing (one new test)
- [ ] Manual: load the page in a browser, click "Run self-test", see
      "Self-test passed (KDF took ~Nms)" in the status line

**Tests added:** 1 (the round-trip known vector test above).

---

### T3.2 · `parseCiphertext` additional edge-case tests

**Goal:** Cover the specific edge cases flagged in the original audit
that the current test suite does not exercise.

**Behavior:** No code changes. Only new test cases.

**Files to touch:**
- Edit `tests/test.mjs`:
  - Add these four tests just before the "// Summary" line at the bottom
    (around line 414):

```js
// --- parseCiphertext: additional edge cases ---
await test('parseCiphertext: rejects iters === 0', () => {
  const bad = btoa(JSON.stringify({ iv: 'a', salt: 'b', ct: 'c', iters: 0 }));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
    /Invalid iteration count/,
  );
});

await test('parseCiphertext: rejects string iters (no implicit coercion)', () => {
  const bad = btoa(JSON.stringify({ iv: 'a', salt: 'b', ct: 'c', iters: '310000' }));
  assert.throws(
    () => parseCiphertext(`-----BEGIN SECRET MESSAGE-----\n${bad}\n-----END SECRET MESSAGE-----`),
  );
});

await test('parseCiphertext: rejects whitespace-only content between headers', () => {
  // \n\n between markers should be stripped to empty and caught
  assert.throws(
    () => parseCiphertext('-----BEGIN SECRET MESSAGE-----\n\n\n-----END SECRET MESSAGE-----'),
    /Empty message content/,
  );
});

await test('parseCiphertext: rejects base64 with invalid characters (not just atob generic error)', () => {
  // ! is not valid base64; atob throws InvalidCharacterError. The wrapper
  // currently re-throws without a specific message.
  assert.throws(
    () => parseCiphertext('-----BEGIN SECRET MESSAGE-----\n!!!@@@###\n-----END SECRET MESSAGE-----'),
  );
});
```

**Acceptance criteria:**
- [ ] `node tests/test.mjs` → 40/40 passing (4 new tests)
- [ ] The `iters === 0` test currently fails on the existing code (or
      passes — either is fine; if it fails, see note below)

**Notes for the agent:** If the `iters === 0` test fails, that means
`parseCiphertext` does NOT reject `iters === 0` (the current condition is
`iters <= 0` which is correct, but a missing `iters` field would also
pass through). The test will pass — it's a regression guard. If the
`string iters` test fails, the existing `typeof === 'number'` check is
working correctly. If `whitespace-only content` fails, the existing
`replace(/\s/g, '')` handles it. The `base64 invalid chars` test
should pass via the natural atob throw.

**Tests added:** 4.

---

### T3.3 · README polish

**Goal:** README mentions v3 features, links to LICENSE, links to
SECURITY.md, has badges for CI status and license.

**Files to touch:**
- Edit `README.md`:
  - Add badges block at the top of the file (after line 8 `Inspired by...`):

```markdown
[![Tests](https://img.shields.io/badge/tests-41%20passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable-purple)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-success)]()
```

  - In the "Features" section (around line 11-20), add these bullet
    points:
    - **Three share paths** — The Copy button (armored block) is the primary path, works in any messenger. Link gives B a one-tap URL. Share uses the system share sheet. QR is reserved for in-person handoff.
    - **One-tap reply** — Decrypted result has a Reply button that prefills the message and passphrase
    - **Diceware passphrase generator** — One click, four random words from the EFF short wordlist (~41 bits of entropy)
    - **Sharable `#d=...` links** — Recipient opens the link, ciphertext preloads into the decrypt tab

  - In the "How It Works" section (around line 22-40), add a new
    subsection after the existing "### Decrypt":

```markdown
### Reply

1. After decrypting a message, tap **Reply** at the bottom of the result.
2. The encrypt tab opens with the message body prefilled and the passphrase remembered for the session.
3. Edit your reply and tap **Encrypt** — then send via **Copy** (the recommended path, works in any messenger) or **Link** (a one-tap URL for B).

### Sharing

When you encrypt, the result modal offers four ways to get the message to B:

- **Copy** (recommended) — copies the armored block to your clipboard. Works in any messenger: Signal, iMessage, WhatsApp, Discord, email, SMS. The block is plain text with a `-----BEGIN/END-----` header, so it's safely pasted anywhere.
- **Link** — copies a `https://...#d=...` URL. B opens the link, the ciphertext preloads into their decrypt tab, they just type the passphrase. One-tap open in messengers that auto-linkify, but the URL itself can show up in link previews, so use Copy for the most privacy-sensitive cases.
- **Share** — uses the system share sheet (Signal, Mail, AirDrop, etc.). Equivalent to Copy + paste into a chat.
- **QR (in person)** — generates a QR code only useful when you and B are physically together. B scans with their phone, the app opens to the decrypt tab. Don't try to share the QR digitally — scanning your own screen is not a real workflow.

For all four paths, share the passphrase with B through a *different* channel (a phone call, in person, a separate message) — never text it in the same message as the ciphertext.
```

  - In the "Running Locally" section (around line 66-85), update line 74
    from `python3 -m http.server 8000` to `python -m http.server 8000` —
    or keep `python3` and note the agent should keep it as-is since the
    user's environment may have either. The README is currently using
    `python3` so leave it.
  - At the end of "Project Structure" (line 87-97), add a line for each
    new file:
    ```
    qrcode.js              QR code generator (vendored, MIT)
    wordlist.js            EFF Diceware short wordlist (vendored, CC BY 3.0)
    LICENSE                MIT license
    SECURITY.md            Vulnerability disclosure policy
    .github/workflows/     CI configuration
    vercel.json            Vercel deployment + security headers
    package.json           Test scripts and project metadata
    ```
  - Replace the "## License" section (lines 112-114) with:

```markdown
## License

MIT — see [LICENSE](LICENSE). Made with love by Tink. Dedicated to B.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities privately.
```

**Acceptance criteria:**
- [ ] `README.md` has a badges block near the top
- [ ] README mentions QR code, Reply, diceware, and `#d=...` share
- [ ] README has a "Reply" subsection and a "Sharing" subsection
- [ ] README's "Sharing" subsection describes all four share paths (Copy/Link/Share/QR), flags Copy as the recommended path, and notes QR is in-person only
- [ ] README's "Project Structure" lists all new files
- [ ] README's "License" section links to `LICENSE` and mentions MIT
- [ ] README's "Security" section links to `SECURITY.md`

**Tests:** None.

---

### T3.4 · Reframe share UX: armored block primary, link one-tap, QR in-person

**Status: SHIPPED (post-plan addition).** This was a v3 feature
oversight caught by the user after PR 1 landed: the QR code is only
useful for in-person handoff (you can't scan your own screen with
your own phone). The armored block is the universal share path;
the link is a one-tap URL; the QR is the rare in-person case.

**What changed:**
- `index.html`: Reordered the four share buttons in the result modal
  from `Copy | Link | QR | Share` to `Copy | Link | Share | QR`. The
  QR button is now labeled `QR (in person)` and uses a new `qr-btn`
  class for visual de-emphasis (smaller, muted color).
- `index.html`: QR canvas caption changed from "Scan with B's phone"
  to "In person: have B scan this with their phone".
- `app.js`: Hint copy under the encrypted result now leads with
  "The armored block above works in any messenger — paste it into
  Signal, iMessage, WhatsApp, or email." and explicitly notes
  "QR is for in-person handoff only."
- `style.css`: New `.qr-btn` rule for the visually de-emphasized QR
  button (10px font, 32px min-height, muted gray).
- `tests/test.mjs`: 4 new regression tests:
  - button order is exactly `[Copy, Link, Share, QR]`
  - QR button label includes "in person"
  - QR canvas caption includes "in person"
  - QR button has `qr-btn` class

**Files touched:** `index.html`, `app.js`, `style.css`, `tests/test.mjs`.

**Acceptance criteria:**
- [ ] Button order in the result modal: `Copy`, `Link`, `Share`, `QR` (in that order)
- [ ] QR button labeled "QR (in person)"
- [ ] QR canvas caption starts with "In person"
- [ ] QR button uses `qr-btn` class (visually de-emphasized)
- [ ] Hint copy on the encrypted result mentions armored block first, link second, QR last
- [ ] `npm test` → 41/41 passing (4 new regression tests)

**Tests added:** 4 (button order, label, caption, class).

---

## Tier 4 — Code health (small fixes, no behavior change)

### T4.1 · Fix `share-btn` class bleed to the QR button

**Goal:** The QR button in the result modal currently has
`class="btn share-btn"`. The CSS rule `.no-share-api .share-btn
{ display: none; }` hides it on browsers without the Web Share API.
This is a latent bug: anyone in a browser without `navigator.share`
(like headless Chrome in some test setups, or older WebViews) gets
**no QR button** at all.

**Files to touch:**
- Edit `index.html`:
  - Line 116: change `<button id="resultQrBtn" class="btn share-btn" type="button" hidden>QR</button>`
    to `<button id="resultQrBtn" class="btn" type="button" hidden>QR</button>`
  - Line 117 (the Share button): keep its class as `share-btn` so the
    CSS rule still hides it on browsers without `navigator.share`
- Edit `style.css`:
  - Verify the `.share-btn` rule (around line 698) only applies to
    `#resultShareBtn` if possible, or just leave it as-is and accept
    that the QR button no longer triggers it

**Acceptance criteria:**
- [ ] `index.html` line 116: `#resultQrBtn` has `class="btn"`, NOT `share-btn`
- [ ] `index.html` line 117: `#resultShareBtn` still has `share-btn`
- [ ] Manual: in a browser that does NOT support `navigator.share`, the
      QR button is visible

**Tests:** Add one to `tests/test.mjs` (around line 400):

```js
// --- QR button visibility (regression guard for share-btn class bleed) ---
import { readFileSync as _rfs } from 'node:fs';
const indexHtml = _rfs(join(__dirname, '..', 'index.html'), 'utf-8');
await test('QR button does not have share-btn class (visible regardless of Web Share API)', () => {
  // Find the QR button by id and check its class
  const m = indexHtml.match(/<button id="resultQrBtn"([^>]*)>/);
  assert.ok(m, 'QR button should exist in index.html');
  assert.ok(!m[1].includes('share-btn'), 'QR button must not have share-btn class (would be hidden in browsers without navigator.share)');
});
```

**Tests added:** 1.

---

### T4.2 · Remove stale `apple-mobile-web-app-capable` deprecation

**Goal:** Browser console shows a deprecation warning on every load. Fix
already covered by T2.2 — listed here for the same reason it's in the
agent's path: so the agent doesn't double-handle it.

**Status:** DONE in T2.2.

**Acceptance criteria:** None (covered by T2.2 acceptance).

**Tests:** None.

---

### T4.3 · Move vendored libraries into a `vendor/` directory

**Goal:** The repo root is getting cluttered. `crypto.js` is project
source; `qrcode.js` and `wordlist.js` are vendored third-party. Move
them to a `vendor/` subdirectory.

**Files to touch:**
- Create `vendor/qrcode.js` (move from `qrcode.js`)
- Create `vendor/wordlist.js` (move from `wordlist.js`)
- Edit `index.html`:
  - Line 126: change `src="qrcode.js"` to `src="vendor/qrcode.js"`
  - Line 127: change `src="wordlist.js"` to `src="vendor/wordlist.js"`
- Edit `service-worker.js`:
  - Lines 11-12: change `./qrcode.js` to `./vendor/qrcode.js`
  - Lines 11-12: change `./wordlist.js` to `./vendor/wordlist.js`
  - Line 18: same updates in the `NETWORK_FIRST` array
- Edit `tests/test.mjs`:
  - Line 245: change `'..', 'qrcode.js'` to `'..', 'vendor', 'qrcode.js'`
  - Line 324: same for wordlist

**Acceptance criteria:**
- [ ] `vendor/qrcode.js` and `vendor/wordlist.js` exist
- [ ] `qrcode.js` and `wordlist.js` no longer exist at repo root
- [ ] `index.html`, `service-worker.js`, `tests/test.mjs` all reference
      the new paths
- [ ] `node tests/test.mjs` → still 40/40 passing
- [ ] Manual: load the page in browser, diceware generator still works
      (verifies wordlist.js is reachable)

**Tests:** None new (all 40 existing tests must still pass).

---

## Tier 5 — Stretch goals (do last, only if there's appetite)

### T5.1 · File-encryption mode

**Why this is here but not urgent:** Different use case (file vs. text),
balloons the UI surface, and the existing PR has no demand signal. The
crypto primitives in `crypto.js` already work on any `ArrayBuffer` so
the implementation is straightforward — it's the UI that's the real
work.

**Out of scope for this plan.** If pursued later, it should be its own
PR with its own design doc, not bolted onto the existing changes.

---

## Recommended execution order

A coding agent should work through tiers in order. Within a tier, items
can usually be done in any order (no inter-dependencies except T1.3
depends on `version.js` existing first, and the T3 features depend on
T1.2 so `npm test` works).

**Recommended PR split:**

- **PR 1 — "Hygiene"**: T1.1, T1.2, T1.3, T1.4, T1.5, T4.1, T4.3
  - Mechanical, low-risk, ~30 minutes
  - Tests go from 35 to 40 (one regression guard for T4.1)
- **PR 2 — "Production security"**: T2.1, T2.2
  - Touches `vercel.json` (new) and `index.html` (one line)
  - No code logic changes
- **PR 3 — "User-facing polish"**: T3.1, T3.2, T3.3
  - Adds the self-test button and feature, adds 5 new tests
  - Updates README to reflect v3 reality
  - Tests go from 40 to 45 (T3.1 = 1, T3.2 = 4)

After PR 3 lands, the repo is at a solid production state. The
remaining items in Tier 5 are deferred.

---

## Verification checklist (run after every PR)

- [ ] `node tests/test.mjs` → all tests pass
- [ ] `node -c app.js` → exits 0 (syntax check)
- [ ] `node -c crypto.js` → exits 0
- [ ] `node -c qrcode.js` → exits 0 (or `node -c vendor/qrcode.js` if T4.3 is done)
- [ ] `node -c wordlist.js` → exits 0
- [ ] Load the page in a browser at `http://localhost:8000` after `npm run serve`
- [ ] Encrypt a test message, verify the result modal opens, auto-copies, auto-clears plaintext
- [ ] Click QR button on the result modal, verify a scannable QR appears
- [ ] Click Link button, paste the URL into a new tab, verify the decrypt tab pre-fills
- [ ] Click Reply on a decrypted result, verify the encrypt tab pre-fills
- [ ] Click Generate on the passphrase field, verify a 4-word diceware phrase appears
- [ ] Click Clear All twice, verify all fields empty
- [ ] Open DevTools → Network → check that no requests go to third-party origins

---

## What I am NOT recommending (explicit non-goals)

- **No frameworks.** The zero-deps stance is a feature. Don't add React, Vue, etc.
- **No build tools.** No webpack, no Vite, no TypeScript compilation. The project ships raw.
- **No cloud sync.** The README's "no servers, no accounts" promise is the brand. Don't add even read-only opt-in cloud storage.
- **No "remember passphrase" features.** Even sessionStorage would weaken the threat model. Keep it in-memory only.
- **No Argon2.** PBKDF2-from-WebCrypto is the right choice for a browser context. Argon2 would require a JS implementation that's *worse* than the built-in primitive.
- **No CSS framework.** The handcrafted monochrome aesthetic is part of the brand. Don't add Tailwind.
- **No analytics.** Privacy tool. Telemetry would be a brand-destroying change.
- **No PWA install prompt customization.** The browser default is fine.

---

*Plan rewritten 2026-06-14 from a fresh audit of commit `c655a75` on `main`. Supersedes the prior `IMPROVEMENTS.md`.*
