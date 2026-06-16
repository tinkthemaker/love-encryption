# Tests

This directory has three test suites. They run independently.

## `test.mjs` — unit tests (50 tests, ~3s, headless)

The default `npm test`. Covers the crypto module, the wordlist loader,
the QR generator, the share-link encoding, the parseCiphertext edge
cases, and HTML structure regression guards.

Runs in pure Node — no Chrome, no network.

## `e2e.js` — end-to-end (22 tests, ~30s, headless Chrome)

Drives the real app in a headless Chrome browser: encrypt, decrypt,
QR, reply, share-link encode. Uses an **ephemeral** profile so the
service worker state is reset every run. This means it does NOT
catch the class of bug where the SW breaks on the second visit
(where the cache actually gets read).

Run with: `node tests/e2e.js [URL]` (default `http://localhost:8000`).
Requires `puppeteer-core` installed somewhere on the system. The
script tries common Chrome install paths; override with
`PUPPETEER_EXECUTABLE_PATH` or `CIPHER_E2E_CHROME`.

**Not run in CI.** Lives in the repo so it can be invoked locally
or in a non-CI workflow.

## `persistent-e2e.js` — second-visit regression guard (10 tests, ~45s, headless Chrome)

Uses a **persistent** browser profile so the service worker state
accumulates across page loads. The page is loaded three times
(cold, reload, reload), and the test asserts the page still
renders correctly each time. This is the only test that catches
the "white screen on second visit" class of bug.

The test is opt-in:

```bash
# 1. Start a local server in another terminal
npm run serve

# 2. Run the persistent e2e (skipped unless CIPHER_E2E_PERSISTENT=1)
CIPHER_E2E_PERSISTENT=1 node tests/persistent-e2e.js
```

You can also point it at a deployed instance:

```bash
CIPHER_E2E_PERSISTENT=1 CIPHER_E2E_URL=https://love-encryption.vercel.app/ \
  node tests/persistent-e2e.js
```

**Not run in CI** (no Chrome, no puppeteer-core in deps). The unit
suite is the CI safety net; these e2e suites exist for local
verification.

## Why aren't the e2e tests in CI?

The project is **zero runtime dependencies**. The unit suite is
pure Node and runs in under 3 seconds. Adding `puppeteer-core` as
a devDependency would mean CI runs `npm install`, which contradicts
the project's "no build tools, no npm" stance in the README.

If you want CI to run e2e, the options are:

1. Add `puppeteer-core` and `chrome` to devDependencies and run e2e in CI
2. Use a separate CI job that has Chrome pre-installed
3. Run the persistent-e2e test manually before any deploy (recommended)

The unit tests catch the regressions that don't require a browser
(service worker structure, HTML structure, crypto correctness).
The e2e tests catch the regressions that only show up in a real
browser (timing, async, real DOM, real SW).

## How the persistent test caught the recent bug

A previous version of the service worker had `importScripts('./version.js')`
but then referenced a top-level `const CACHE_NAME` that didn't exist
(because version.js wraps its declarations in an IIFE). The
`CACHE_NAME` was therefore `undefined`, and the SW's `caches.open(undefined)`
silently used the string `"undefined"` as the cache name. Returning
visitors — anyone who'd been to the site before — hit a white
screen.

The ephemeral e2e didn't catch this because:
- The first visit was from the network, before the SW had a chance
  to intercept anything
- The SW's cache was empty so the `cache.match` calls returned null
- The page fell through to the network and worked

The persistent e2e catches it because:
- It visits the site (SW installs, caches files into the broken
  `"undefined"` cache)
- It reloads (now the SW is controlling the page, intercepts
  everything, returns 503 from the `Offline` fallback)
- It asserts the page still has `bodyLen > 100` and
  `window.CipherCrypto` is defined
- The assertion fails because the page is a 503 error page

The test runs three reloads to ensure the SW is fully active and
controlling the page.
