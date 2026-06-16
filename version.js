/**
 * CIPHER — single source of truth for the app version.
 *
 * Bump this when the app changes in a way that requires a service
 * worker cache invalidation. Both the encrypted-bundle `v` field and
 * the service worker `CACHE_NAME` are derived from this constant.
 *
 * Wrapped in an IIFE so `const` declarations don't leak into the script's
 * shared global lexical environment (where they'd collide with other
 * <script>-loaded files).
 */
(() => {
  const APP_VERSION = 5; // bumped: fix service-worker CACHE_NAME = undefined bug (PR 1 regression)
  const CACHE_NAME = `cipher-v${APP_VERSION}`;

  // Publish to every common global scope so crypto.js (loaded after us)
  // can read APP_VERSION without needing an import. The browser sets
  // `window`, service workers set `self`, Node tests use globalThis.
  if (typeof globalThis !== 'undefined') {
    globalThis.CIPHER_VERSION = { APP_VERSION, CACHE_NAME };
  }
  if (typeof window !== 'undefined') {
    window.CIPHER_VERSION = { APP_VERSION, CACHE_NAME };
  }
  if (typeof self !== 'undefined') {
    self.CIPHER_VERSION = { APP_VERSION, CACHE_NAME };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APP_VERSION, CACHE_NAME };
  }
})();
