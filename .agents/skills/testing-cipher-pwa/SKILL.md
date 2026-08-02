---
name: testing-cipher-pwa
description: How to serve, drive and verify the CIPHER client-side encryption PWA (crypto round-trips, keyboard shortcuts, service worker / offline behaviour) during end-to-end testing.
---

# Testing the CIPHER PWA

CIPHER is a zero-dependency, client-side PWA (plain HTML/CSS/JS, no build step, no backend,
no login, no credentials). Everything runs in the browser.

## Serving the app

It **must** be served over http/https — the service worker and the clipboard API need a secure
context, and `http://localhost` counts. Opening `index.html` via `file://` will not work.

```powershell
# from the repo root
python -m http.server 8000    # `npm run serve` does the same
# then open http://localhost:8000/index.html
```

Python 3.7+ `http.server` is threaded, which matters because the service worker's
`cache.addAll()` fetches ~10 files concurrently during install.

## Unit tests

```bash
node tests/test.mjs     # or: npm test   → expect "54 tests: 54 passed, 0 failed"
```

There is also a Puppeteer suite (`tests/e2e.js`, `tests/persistent-e2e.js`) that requires
`puppeteer-core`, which is **not** in `package.json`. Either install it yourself or skip it and
drive a real browser instead.

## Key UI element IDs (from index.html)

| Element | Selector |
| --- | --- |
| Passphrase input | `#pass` |
| Generate passphrase | `#generatePassBtn` |
| Clear All (two-click confirm → `Confirm Clear?`) | `#clearAllBtn` |
| Encrypt / Decrypt tab buttons | `#nav-encrypt` / `#nav-decrypt` |
| Plaintext / ciphertext textareas | `#pt` / `#ct` |
| Encrypt / Decrypt action buttons | `#encryptBtn` / `#decryptBtn` |
| Status line (all success + error text) | `#status` |
| Result modal + its textarea | `#resultOverlay` / `#resultContent` |
| Reply / Close in the modal | `#resultReplyBtn` / `#resultDoneBtn` |
| Footer self-test | `#selfTestBtn` |

`#status` is where every error and success message lands — assert on its `textContent`.
`Run self-test` does a full encrypt→decrypt of a test vector and reports
`Self-test passed (KDF took Nms)`, which is a fast smoke test of the crypto path.

## Building hostile / edge-case ciphertext

The armored format is `-----BEGIN SECRET MESSAGE-----` + base64(JSON bundle) +
`-----END SECRET MESSAGE-----`, where the bundle is `{v, alg, iv, salt, iters, ct}`.
To test malformed or hostile input, encrypt a real message first, then mutate its bundle so the
`iv`/`salt`/`ct` stay valid base64:

```js
const raw = document.querySelector('#ct').value;
const bundle = JSON.parse(atob(raw.replace(/-----[^-]+-----/g,'').replace(/\s+/g,'')));
bundle.iters = 2000000000;                       // or whatever you want to test
const evil = '-----BEGIN SECRET MESSAGE-----\n'
  + btoa(JSON.stringify(bundle)).replace(/(.{64})/g,'$1\n').trim()
  + '\n-----END SECRET MESSAGE-----';
await navigator.clipboard.writeText(evil);       // then paste into #ct through the UI
```

`navigator.clipboard.writeText` triggers a one-time Chrome permission prompt — click **Allow**
and re-run it, otherwise the paste silently inserts stale clipboard content.

## Measuring "did not freeze" assertions

Reaction time is too slow to judge a main-thread block visually. Instrument it instead:

```js
document.querySelector('#decryptBtn').addEventListener('click',
  () => { window.__t0 = performance.now(); }, true);
new MutationObserver(() => console.log('after ' + Math.round(performance.now() - window.__t0) + 'ms: '
  + document.querySelector('#status').textContent))
  .observe(document.querySelector('#status'), {childList:true, subtree:true, characterData:true});
```

## Service worker testing — IMPORTANT

**The SW wedge in the automation Chrome profile is INTERMITTENT — always try the automation
Chrome first.** As of the PR #11 run (2026-08-02) the automation Chrome registered and
activated the SW normally (`caches.keys()` returned `["cipher-v6"]` via `browser_console`,
`navigator.serviceWorker.controller` was set, registration `active` state `activated`), so the
whole SW/offline suite ran in the primary browser with no clean profile needed. Quick check to
run first:

```js
navigator.serviceWorker.getRegistrations().then(r=>console.log(r.length, r[0]&&r[0].active&&r[0].active.state));
caches.keys().then(k=>console.log('CACHES', k));
```

If that shows an activated worker and `["cipher-v6"]`, skip the clean profile entirely.

**Fallback — when the wedge IS present:** in some sessions the automation profile
`--user-data-dir=...\.browser_data_dir` (launched with `--disable-background-networking`,
`--enable-automation` and a `--load-extension` adblock) cannot register *any* service worker —
`navigator.serviceWorker.register()` never settles and `chrome://serviceworker-internals` shows
the worker stuck at `Running Status: STARTING` / `Renderer thread ID: -1` forever. It affects
*any* service worker, so **do not report it as an app bug**.

Confirm it is environmental by registering a throwaway no-op worker
(`self.addEventListener('install', () => self.skipWaiting())`) — if that hangs too, it is the
environment. Then work around it by launching a clean Chrome instance:

```powershell
Start-Process "C:\devin\chrome\chrome-win64\chrome.exe" -ArgumentList `
  '--user-data-dir=C:\Users\Administrator\.sw_test_profile','--no-first-run',`
  '--no-default-browser-check','--no-sandbox','--disable-gpu',`
  '--window-size=1280,900','--remote-debugging-port=29230',`
  'http://localhost:8000/index.html'
```

Service workers register normally there. Note the `browser_console` tool still targets the
original automation Chrome, so in the clean instance use the DevTools GUI instead:

- **Application → Service workers** — shows `#N activated and is running`, plus the
  **Offline** checkbox for offline tests (offline emulation only persists while DevTools is open,
  so do not close it mid-test).
- **Application → Cache storage** — read cache names (e.g. `cipher-v6`) visually rather than
  typing `caches.keys()`, which is unreliable (see below).
- `chrome://serviceworker-internals` — ground truth for install/activation status.

`CACHE_NAME` is derived from `APP_VERSION` in `version.js` (`cipher-v<N>`). After bumping it,
assert the new cache exists and old ones plus any `cipher-undefined` are gone — a
`CACHE_NAME === undefined` bug previously white-screened returning visitors, so **always test a
second visit (reload) and not just a cold load**.

## Computer-use gotchas on this app/box

- The `type` action **silently drops** `:`, `(`, `)` and `=>`. Send colons with
  `key shift+semicolon`. This makes typing JS into the DevTools console unreliable — prefer the
  `browser_console` tool, or use DevTools GUI panels.
- Typing a URL into the Chrome omnibox often falls through to a Google search. Type the host,
  send the colon via `shift+semicolon`, then click the URL suggestion row rather than pressing
  Enter.
- The result modal is **taller than a 768px viewport**, so `Close`/`Reply` sit offscreen at 100%
  zoom and the page scroll does not move the fixed overlay. Press `ctrl+minus` two or three times
  to zoom out and reach them (or press `Escape`, which also closes the modal).
- `wmctrl` does not exist (Windows). Chrome is already launched with `--start-maximized`; use
  `double_click` on the title bar if a window needs maximizing.
- The `upload_attachment` tool rejects Windows paths (`C:\...` and `C:/...`). Copy files into
  `C:\tmp\...` and pass the POSIX form (`/tmp/...`).

## Whitespace-sensitivity tests

The app intentionally does **not** trim the passphrase or message (only the emptiness check is
trimmed), so whitespace is cryptographically significant. Trailing spaces in `#pass` and leading/
trailing newlines in `#pt` survive normal keyboard typing — verify what actually landed by reading
`document.querySelector('#pass').value` via `JSON.stringify` before asserting on the round-trip.

## Devin Secrets Needed

None. The app has no backend, no accounts and no API keys.
