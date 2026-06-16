// Persistent-profile e2e test for service-worker round-trip behavior.
//
// This test catches the class of bug where the service worker looks
// fine on the FIRST visit (when files come from the network) but
// breaks on the SECOND visit (when the SW's stale-while-revalidate
// or cache-first strategies actually run). The previous e2e suite
// used an ephemeral profile, so the SW state was thrown away
// between launches — the bug shipped undetected.
//
// Run with: node tests/persistent-e2e.js [URL]
// Default URL: http://localhost:8000 (a local server started by `npm run serve`)
// In CI, this test is skipped unless CIPHER_E2E_PERSISTENT=1 is set AND
// the local server responds on the given URL.

const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Chrome executable path. Override with PUPPETEER_EXECUTABLE_PATH or
// CIPHER_E2E_CHROME. Falls back to common Windows / macOS / Linux paths.
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  || process.env.CIPHER_E2E_CHROME
  || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') && 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  || (fs.existsSync('/usr/bin/google-chrome') && '/usr/bin/google-chrome')
  || (fs.existsSync('/usr/bin/chromium') && '/usr/bin/chromium')
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const URL = process.argv[2] || process.env.CIPHER_E2E_URL || 'http://localhost:8000/';
const PERSISTENT = process.env.CIPHER_E2E_PERSISTENT === '1';

let pass = 0, fail = 0;
const log = (msg) => console.log(msg);
const check = (name, cond, extra = '') => {
  if (cond) { pass++; log(`  PASS: ${name}`); }
  else { fail++; log(`  FAIL: ${name} ${extra}`); }
};

async function main() {
  // Use a per-process persistent profile so the SW state carries across runs.
  const profileDir = path.join(os.tmpdir(), `cipher-persistent-e2e-${process.pid}`);
  log(`Persistent profile: ${profileDir}`);
  log(`Target URL: ${URL}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    userDataDir: profileDir,
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', e => log(`  [pageerror] ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error') log(`  [console.error] ${m.text()}`);
    });

    // Visit 1: cold. SW installs, caches files.
    log('\n=== Visit 1 (cold) ===');
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForFunction(() => {
      const reg = navigator.serviceWorker?.controller;
      // SW might not be controlling yet on cold visit; that's fine.
      return document.querySelector('#nav-encrypt') !== null;
    }, { timeout: 5000 });
    const state1 = await page.evaluate(() => ({
      title: document.title,
      bodyLen: document.body?.innerHTML.length || 0,
      hasCipherCrypto: typeof window.CipherCrypto,
      selfTestBtn: !!document.querySelector('#selfTestBtn'),
    }));
    log(`  bodyLen=${state1.bodyLen}  hasCipherCrypto=${state1.hasCipherCrypto}  selfTestBtn=${state1.selfTestBtn}`);
    check('Visit 1: page renders', state1.bodyLen > 100);
    check('Visit 1: window.CipherCrypto is defined', state1.hasCipherCrypto === 'object');
    check('Visit 1: selfTestBtn is present', state1.selfTestBtn);

    // Wait for the SW to install and take control. The browser only
    // starts using the SW on the *next* navigation after install, so
    // reload after a short delay.
    log('\n=== Waiting for SW to install ===');
    await new Promise(r => setTimeout(r, 2000));
    const swBeforeReload = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        hasReg: !!reg,
        active: reg?.active?.scriptURL || null,
        controller: navigator.serviceWorker.controller?.scriptURL || null,
      };
    });
    log(`  Before reload: ${JSON.stringify(swBeforeReload)}`);

    // Visit 2: reload. THIS is the case the previous e2e missed — the
    // SW is now active, intercepts requests, and uses the broken cache.
    log('\n=== Visit 2 (SW active, reload) ===');
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const state2 = await page.evaluate(() => ({
      title: document.title,
      bodyLen: document.body?.innerHTML.length || 0,
      hasCipherCrypto: typeof window.CipherCrypto,
      selfTestBtn: !!document.querySelector('#selfTestBtn'),
    }));
    log(`  bodyLen=${state2.bodyLen}  hasCipherCrypto=${state2.hasCipherCrypto}  selfTestBtn=${state2.selfTestBtn}`);

    check('Visit 2: page still renders (no white screen)', state2.bodyLen > 100,
      `(bodyLen=${state2.bodyLen}; a white screen would show bodyLen < 200)`);
    check('Visit 2: window.CipherCrypto is still defined', state2.hasCipherCrypto === 'object',
      `(got ${state2.hasCipherCrypto}; white screen would be "undefined")`);
    check('Visit 2: selfTestBtn is still present', state2.selfTestBtn);
    check('Visit 2: title is still CIPHER', state2.title === 'CIPHER',
      `(got "${state2.title}")`);

    // Visit 3: another reload. Belt-and-braces — even if visit 2
    // happened to land in a transient state, visit 3 confirms the
    // SW's cache is stable.
    log('\n=== Visit 3 (cached) ===');
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const state3 = await page.evaluate(() => ({
      title: document.title,
      bodyLen: document.body?.innerHTML.length || 0,
      hasCipherCrypto: typeof window.CipherCrypto,
      selfTestBtn: !!document.querySelector('#selfTestBtn'),
    }));
    log(`  bodyLen=${state3.bodyLen}  hasCipherCrypto=${state3.hasCipherCrypto}  selfTestBtn=${state3.selfTestBtn}`);
    check('Visit 3: page still renders', state3.bodyLen > 100);
    check('Visit 3: window.CipherCrypto is still defined', state3.hasCipherCrypto === 'object');

    // Verify the cache is actually populated (proves the SW worked
    // end-to-end, not just that the page happened to load from network).
    const cacheInfo = await page.evaluate(async () => {
      const names = await caches.keys();
      const items = [];
      for (const name of names) {
        const c = await caches.open(name);
        const reqs = await c.keys();
        items.push({ name, count: reqs.length, urls: reqs.map(r => new URL(r.url).pathname) });
      }
      return items;
    });
    log(`\n  Caches: ${JSON.stringify(cacheInfo, null, 2)}`);
    const realCache = cacheInfo.find(c => c.name.startsWith('cipher-v'));
    check('A cipher-v* cache exists', !!realCache);
    if (realCache) {
      // APP_SHELL has 10 entries, but the SW's network-first strategy
      // may add additional entries via cache.put(). Just check that
      // the cache has the expected set of paths.
      const paths = realCache.urls || [];
      const expected = [
        '/', '/index.html', '/style.css', '/app.js', '/crypto.js',
        '/version.js', '/vendor/qrcode.js', '/vendor/wordlist.js',
        '/heart-192.png', '/heart-512.png',
      ];
      const allPresent = expected.every(p => paths.includes(p));
      check(`Cache contains all APP_SHELL paths`, allPresent,
        `(missing: ${expected.filter(p => !paths.includes(p)).join(', ')})`);
    }

    log(`\n=== Summary ===  ${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
  } finally {
    await browser.close();
  }
}

// Preflight: verify the URL is reachable before launching Chrome.
async function preflight() {
  const http = require('node:http');
  const https = require('node:https');
  return new Promise((resolve) => {
    const parsed = new global.URL(URL);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(URL, { timeout: 5000 }, (res) => {
      // We don't care about the response code, just that we got one
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  if (!PERSISTENT) {
    log('Skipping persistent e2e (set CIPHER_E2E_PERSISTENT=1 to run)');
    log('This test requires a local server; in CI, run after `npm run serve &`');
    process.exit(0);
  }
  const ok = await preflight();
  if (!ok) {
    log(`Preflight: ${URL} not reachable — skipping persistent e2e`);
    log('Start a local server first (e.g. `npm run serve &`)');
    process.exit(0);
  }
  await main();
})();
