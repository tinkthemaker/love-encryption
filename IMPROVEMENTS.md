# LoveEncryption (CIPHER) — Improvement Plan

**Repo:** [tinkthemaker/love-encryption](https://github.com/tinkthemaker/love-encryption)
**Live:** https://love-encryption.vercel.app
**Local clone:** `E:\AI backups\love-encryption\`
**Status baseline:** 0★ / 0 forks · 9 closed PRs, 0 open · 0 releases · 23/23 tests passing · last commit 2026-05-28

---

## Audit summary

The project is **already in good shape** — recent Claude-Code audit chains (PRs #1–#9, themed "The Enchanter's Rite") added a test suite, hardened validation, fixed a decrypt-tab panel bug, and rewrote the README. The crypto primitives in `crypto.js` follow OWASP 2023 guidance (PBKDF2-SHA256 @ 310k iterations, AES-256-GCM, 16-byte salt, 12-byte IV, downgrade-protected).

What remains falls into 4 buckets: **legal/process hygiene, production security headers, missing user-facing features, and test coverage gaps**. None are critical bugs; all are reasonable next-step polish.

---

## Tier 1 — Quick wins (≤ 30 min total)

### T1.1 · Add a LICENSE file
**Why:** Repo has no license. README only credits "Made with love by Tink." Without a license, the code is technically **all-rights-reserved by default** under copyright — neither you nor others can legally reuse it.
**Fix:** Add `LICENSE` (MIT if you want max permissiveness; AGPL-3.0 if you want crypto-tool derivatives to stay open, which fits the privacy ethos).
**Effort:** 30 seconds.

### T1.2 · Add `package.json` with a test script
**Why:** README tells contributors to run `node tests/test.mjs` manually. No `package.json` exists, so no `npm test`, no scripts discoverable via `npm run`.
**Fix:**
```json
{
  "name": "love-encryption",
  "version": "2.1.0",
  "type": "module",
  "private": true,
  "description": "Secure client-side message encryption using AES-256-GCM.",
  "scripts": {
    "test": "node tests/test.mjs",
    "serve": "python3 -m http.server 8000"
  },
  "engines": { "node": ">=18" }
}
```
**Effort:** 2 min.

### T1.3 · Sync `CACHE_NAME` with `APP_VERSION`
**Why:** `service-worker.js` hard-codes `CACHE_NAME = 'cipher-v2.1'`, but `crypto.js` has `APP_VERSION = 2`. They drift. When you bump `crypto.js` to v3, users offline will get stuck on the old version because the SW serves cached stale files. The "v2.1" string is the *only* place the SW is aware of the version.
**Fix:** Either (a) read `APP_VERSION` from a shared `version.js`, or (b) document the sync requirement in a code comment and bump both in lockstep. Option (a) is one line of code:
```js
// service-worker.js
importScripts('./version.js');                       // new file
const CACHE_NAME = `cipher-v${APP_VERSION}`;
```
**Effort:** 5 min.

### T1.4 · Add GitHub Actions CI
**Why:** No `.github/workflows/`. PRs have no automated test gate.
**Fix:** Add `.github/workflows/test.yml`:
```yaml
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm test
```
**Effort:** 5 min.

### T1.5 · Add `SECURITY.md`
**Why:** A privacy tool attracts security researchers. Without a disclosure channel, you either get a public exploit-disclosure issue (bad) or a researcher who finds a real bug and walks away (worse).
**Fix:** Add `.github/SECURITY.md` (or `SECURITY.md` at root) with a contact email and a "please don't open public issues" note.
**Effort:** 5 min.

---

## Tier 2 — Production security posture (≈ 1 hr)

### T2.1 · Add security headers via `vercel.json`
**Why:** `curl -I https://love-encryption.vercel.app` returns only HSTS. **No CSP, no `X-Frame-Options`, no `Referrer-Policy`, no `X-Content-Type-Options`**. For a tool whose entire pitch is "zero-trust privacy," the response headers are an open book. Vercel will happily serve any page that frames you or detects MIME types.
**Fix:** Add `vercel.json`:
```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      {
        "key": "Content-Security-Policy",
        "value": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"
      },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "no-referrer" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" }
    ]
  }]
}
```
**Caveat:** `style-src 'unsafe-inline'` is required because `index.html` uses inline `<style>` only if it does — verify by grepping `index.html` for `<style>`. If no inline styles, drop `'unsafe-inline'`. The current `index.html` shows no inline `<style>` block, so you can go strict.
**Effort:** 15 min including testing.

### T2.2 · Add `X-Frame-Options: DENY` (belt-and-braces for old browsers)
CSP `frame-ancestors 'none'` covers modern browsers; `X-Frame-Options: DENY` covers IE/old Safari. Two-second add to the `vercel.json` above.
**Effort:** 30 sec.

### T2.3 · Pin Vercel deploy to commit SHA in service worker
**Why:** Currently, the SW caches by URL. If Vercel rolls back to an earlier deploy, users with v3 cached will get v2 served. Tie cache names to a build identifier.
**Effort:** 10 min (build SHA injection in Vercel).

---

## Tier 3 — User-facing features (≈ 1 weekend)

### T3.1 · `#d=<base64>` URL-fragment share links
**Why:** Current flow: "agree on a passphrase, send the armored block." Awkward for one-off shares. The hardened version: app generates a one-time link `https://love-encryption.vercel.app/#d=eyJ2...&v=2` — ciphertext lives in the **fragment**, which browsers never send to servers. The passphrase is told out-of-band. Zero-knowledge sharing with one click.
**Why it's safe:** The URL fragment (everything after `#`) is not transmitted by browsers; it stays client-side only. Vercel analytics can't see it. CSP `referrer` already set to `no-referrer` covers the rest.
**Implementation:** ~40 lines in `app.js`:
```js
// On encrypt success: window.location.hash = `d=${btoa(formattedCiphertext)}`;
// On page load: parse location.hash, prefill the decrypt textarea, switch to decrypt tab.
```
**Effort:** 3 hr.

### T3.2 · Diceware / random passphrase generator
**Why:** The strength meter is a 6-bucket heuristic (`length>8`, mixed case, etc.). Privacy-conscious users with no diceware tool are exactly the target audience. A "Generate" button using `crypto.getRandomValues` to produce 5-word diceware (or a 24-char random string) makes this a **complete** privacy toolkit, not just an encryptor. Themed diceware wordlist fits the existing aesthetic.
**Effort:** 2 hr including a 200-word themed list.

### T3.3 · File-encryption mode
**Why:** Currently text-only. Real use case for the audience: encrypt photos (`photo.jpg.cipher`), voice memos, PDFs. The crypto primitives in `crypto.js` work on any `ArrayBuffer`; the UI just needs a file picker + `<a download>` for the output.
**Path:** Add an optional "File" tab next to Encrypt/Decrypt. Reuse `encryptMessage(pass, fileBuffer)` — no crypto changes needed.
**Effort:** 2 hr.

### T3.4 · In-app self-test
**Why:** A paranoid-but-correct user wants to verify *their* browser's WebCrypto works. A "Run self-test" button that encrypts+decrypts a known vector and reports KDF time (ms) doubles as a smoke test for the local install and gives confidence after a browser update.
**Effort:** 1 hr.

---

## Tier 4 — Test coverage expansion (≈ 1 day)

### T4.1 · jsdom integration tests for `app.js`
**Why:** 23/23 tests cover `crypto.js`. Zero tests cover `app.js` event handlers, the modal flow, tab switching, or `service-worker.js`. Bugs in UI glue won't be caught.
**Fix:** Add `tests/app.test.mjs` using `jsdom` + `node:test`:
- Tab switching updates ARIA
- `handleEncrypt` rejects empty passphrase with `ERROR: No passphrase set`
- `handleDecrypt` rejects malformed ciphertext with `ERROR: Invalid or corrupted ciphertext`
- `parseCiphertext` trim + whitespace-strip is lossless
- `formatCiphertext` empty-string case (currently not tested)
- Service worker registers without throwing
**Effort:** 4 hr.

### T4.2 · `parseCiphertext` edge cases not yet covered
**Why:** Manual code review of `parseCiphertext` in `crypto.js` shows:
- ✅ No headers
- ✅ Partial headers
- ✅ Empty content
- ✅ Missing fields
- ✅ Non-string fields
- ✅ Non-object payload
- ✅ Non-finite `iters`
- ❌ **Whitespace-only content between headers** (`"   "` after stripping → empty string → caught, but `"\n\n"` between content is not tested)
- ❌ **`iters` of `0`** (currently caught by `iters <= 0` check, but not in a test)
- ❌ **Base64 with trailing `=` padding missing** (atob throws, but message is generic)
- ❌ **String coercion of numeric `iters`** (`{iters: "310000"}` passes the `typeof === 'number'` check — actually rejected; verify)
**Effort:** 30 min, add 4 tests.

### T4.3 · Service worker tests
**Why:** `service-worker.js` has zero tests. The stale-while-revalidate logic, cache cleanup on activate, and `NETWORK_FIRST` file matching are all untested.
**Fix:** Use `service-worker-mock` or jsdom + a fake `caches`/`fetch`. Or accept that the SW is small and well-reviewed.
**Effort:** 3 hr (or skip — low ROI for a 60-line file).

---

## Tier 5 — Polish (low priority, opt-in)

### T5.1 · README badges
Add: test status (from CI in T1.4), Vercel deploy, license (from T1.1), file count, "Zero Dependencies" badge. The "Zero deps" / "Works offline" claims deserve visual proof.
**Effort:** 10 min.

### T5.2 · Split `style.css` (19 KB) into `bg.css` + `style.css`
The 6 background effects (`.bg-grid`, `.bg-glow-1/2`, `.bg-scanlines`, `.bg-noise`, `.bg-vignette`) are decorative. Move to `bg.css`. Cosmetic / Lighthouse.
**Effort:** 20 min.

### T5.3 · Internationalization
Currently English-only, hard-coded "Dedicated to B." Skip if B is the only user; consider if you want a wider audience. Privacy tools have a multilingual niche (the "I want to send a love note that no one can read, including my government" market).
**Effort:** 1 day per language.

### T5.4 · `package.json` keywords + repository metadata
Once T1.2 is done, add:
```json
"keywords": ["encryption", "aes-gcm", "pwa", "privacy", "client-side"],
"repository": { "type": "git", "url": "git+https://github.com/tinkthemaker/love-encryption.git" },
"homepage": "https://love-encryption.vercel.app"
```
Makes the repo discoverable on npm search and GitHub.
**Effort:** 1 min.

---

## Recommended sprint plan

If you want to spend **one weekend** on this, the order is:

| Day | Time | Task |
|---|---|---|
| Sat AM | 30 min | T1.1 + T1.2 + T1.3 + T1.4 + T1.5 (Tier 1) |
| Sat PM | 1 hr | T2.1 + T2.2 (security headers) |
| Sun AM | 3 hr | T3.1 (URL-fragment share links) |
| Sun PM | 2 hr | T3.2 (diceware generator) |
| Sun late | 1 hr | T4.2 (parseCiphertext edge cases) |

**Result:** Legal clarity, production security headers, shareable-link UX, diceware generator, and expanded test coverage — all on a clean PR. The big remaining items (T3.3 file mode, T4.1 jsdom tests) are follow-up weekend work.

---

## What I'd recommend NOT doing

- **Don't switch to a framework.** The "zero deps, no build" stance is a feature, not a limitation. It's why the repo is 843 KB and the live site is instant.
- **Don't move off Vercel.** It's working, the deployment is configured, and CSP headers can be added via `vercel.json` (T2.1).
- **Don't add accounts / cloud sync.** The README explicitly promises "no servers, no accounts, no data collection." Adding even a *read-only* opt-in cloud sync would be a brand-destroying change. Stay zero-knowledge.
- **Don't add "remember passphrase" features.** Same reason. Even localStorage would weaken the threat model.
- **Don't replace PBKDF2 with Argon2.** Argon2 isn't natively in Web Crypto; you would have to import a JS implementation, which is *worse* than PBKDF2-from-WebCrypto. PBKDF2-SHA256 @ 310k is the right call for a browser context.

---

## Verification checklist (post-implementation)

Before merging any change, confirm:

- [ ] `npm test` → 23+ tests passing
- [ ] Live site at https://love-encryption.vercel.app loads + service worker registers
- [ ] `curl -I https://love-encryption.vercel.app` shows the new security headers
- [ ] Encrypt → decrypt round-trip in browser works (text mode at minimum)
- [ ] PWA install prompt appears on mobile
- [ ] Offline mode works (DevTools → Network → Offline → reload still functions)
- [ ] `#d=` share link (if implementing T3.1) works end-to-end between two browsers
- [ ] CI green on the PR

---

*Plan generated 2026-06-09 from a live audit of commit `3efd9f7` on `main`. Re-run after any major change to keep this document current.*
