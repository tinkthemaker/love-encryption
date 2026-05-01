(() => {
  "use strict";

  // --- DOM Element Selection ---
  const $ = sel => document.querySelector(sel);
  const passEl = $('#pass');
  const ptEl = $('#pt'), ctEl = $('#ct');
  const resultOverlay = $('#resultOverlay');
  const resultTitleEl = $('#resultTitle');
  const resultContentEl = $('#resultContent');
  const statusEl = $('#status');
  const encryptBtn = $('#encryptBtn');
  const decryptBtn = $('#decryptBtn');
  const clearAllBtn = $('#clearAllBtn');
  const togglePassBtn = $('#togglePassBtn');
  const resultCopyBtn = $('#resultCopyBtn');
  const resultShareBtn = $('#resultShareBtn');
  const resultDoneBtn = $('#resultDoneBtn');
  const resultFormatToggle = $('#resultFormatToggle');
  const formatTextBtn = $('#formatTextBtn');
  const formatLinkBtn = $('#formatLinkBtn');
  const navEncrypt = $('#nav-encrypt');
  const navDecrypt = $('#nav-decrypt');
  const tabEncrypt = $('#tab-encrypt');
  const tabDecrypt = $('#tab-decrypt');

  // Holds the most recent encrypt result so the Text/Link toggle can re-render.
  let lastEncryptedBundle = null;

  // --- Constants ---
  const APP_VERSION = 2;
  const KDF_ITERATIONS = 310000;
  const MIN_KDF_ITERATIONS = 100000;
  const DEBOUNCE_DELAY = 150;
  const strengthEl = $('#strength');

  // --- Utility Functions ---
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
    from: str => Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer
  };

  const rand = n => crypto.getRandomValues(new Uint8Array(n));

  /**
   * Creates a debounced function that delays invocation.
   * @param {Function} fn The function to debounce.
   * @param {number} delay Delay in milliseconds.
   * @returns {Function} The debounced function.
   */
  function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Triggers a short vibration on supported devices.
   */
  function vibrate() {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }

  // --- Ciphertext Formatting Functions ---

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
   * Builds a self-contained share link: the ciphertext lives in the URL
   * fragment, so it never reaches a server.
   * @param {object} bundle The encrypted data object.
   * @returns {string} A URL with the bundle encoded in its fragment.
   */
  function bundleToShareLink(bundle) {
    const json = JSON.stringify(bundle);
    const urlSafe = btoa(json)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `${location.origin}${location.pathname}#m=${urlSafe}`;
  }

  /**
   * Parses a `#m=...` fragment back into a bundle.
   * @param {string} fragment The hash fragment, with or without leading '#'.
   * @returns {object|null} The bundle, or null if not a recognized link.
   */
  function parseShareLinkFragment(fragment) {
    if (!fragment) return null;
    const match = fragment.match(/#?m=([A-Za-z0-9_\-]+)/);
    if (!match) return null;
    let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bundle = JSON.parse(atob(b64));
    if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
      throw new Error('Invalid encryption data');
    }
    if (typeof bundle.iv !== 'string' || !bundle.iv ||
        typeof bundle.salt !== 'string' || !bundle.salt ||
        typeof bundle.ct !== 'string' || !bundle.ct) {
      throw new Error('Missing required encryption data');
    }
    return bundle;
  }

  /**
   * Pulls a ciphertext bundle out of arbitrary pasted/shared text. Accepts
   * armored blocks or share links (which may be embedded in surrounding text).
   * @param {string} text Raw text from clipboard, share sheet, etc.
   * @returns {object|null} A bundle if one is found, else null.
   */
  function extractBundle(text) {
    if (!text) return null;
    if (text.includes('-----BEGIN SECRET MESSAGE-----')) {
      try { return parseCiphertext(text); } catch { /* fall through */ }
    }
    if (text.includes('#m=')) {
      try { return parseShareLinkFragment(text); } catch { /* fall through */ }
    }
    return null;
  }

  // --- Core Crypto Functions ---

  /**
   * Derives a cryptographic key from a password and salt.
   * @param {string} pass The user's password.
   * @param {Uint8Array} salt A random salt.
   * @param {number} iterations The number of PBKDF2 iterations.
   * @returns {Promise<CryptoKey>} The derived AES-GCM key.
   */
  async function deriveKey(pass, salt, iterations) {
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /**
   * Encrypts a plaintext message with a password.
   * @param {string} pass The user's password.
   * @param {string} plaintext The message to encrypt.
   * @returns {Promise<object>} An object containing the encrypted data and parameters.
   */
  async function encryptMessage(pass, plaintext) {
    const salt = rand(16);
    const iv = rand(12);
    const key = await deriveKey(pass, salt, KDF_ITERATIONS);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
    return { v: APP_VERSION, alg: 'AES-GCM-256/PBKDF2-SHA256', iv: b64.to(iv), salt: b64.to(salt), iters: KDF_ITERATIONS, ct: b64.to(ct) };
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

  // --- UI Functions ---

  /**
   * Displays a status message to the user.
   * @param {string} msg The message to display.
   * @param {string} [type='muted'] The type of message (e.g., 'danger', 'ok').
   */
  function setStatus(msg, type = 'muted') {
    statusEl.textContent = msg;
    statusEl.className = 'status';
    if (type !== 'muted') statusEl.classList.add(type);
    if (msg) {
      statusEl.classList.add('visible');
    } else {
      statusEl.classList.remove('visible');
    }
  }

  /**
   * Shows the result modal with a title and content.
   * Auto-copies to clipboard and selects text for user convenience.
   * @param {string} title The title for the modal.
   * @param {string} content The content for the modal's textarea.
   * @param {object} [opts] Display options.
   * @param {boolean} [opts.allowFormatToggle] Show the Text/Link format toggle.
   */
  async function showResult(title, content, opts = {}) {
    resultTitleEl.textContent = title;
    resultContentEl.value = content;
    resultOverlay.classList.add('active');

    // Format toggle is only meaningful for encrypt output
    if (opts.allowFormatToggle) {
      resultFormatToggle.hidden = false;
      setFormatToggle('text');
    } else {
      resultFormatToggle.hidden = true;
    }

    // Show Share button only when the platform supports it
    const canShare = typeof navigator.share === 'function';
    resultShareBtn.hidden = !canShare;

    // Auto-select text for easy copying
    setTimeout(() => {
      resultContentEl.focus();
      resultContentEl.select();
    }, 100);

    await copyResultContent({ silent: true });
  }

  /**
   * Copies the current result modal content, updating the Copy button state.
   */
  async function copyResultContent({ silent = false } = {}) {
    try {
      await navigator.clipboard.writeText(resultContentEl.value);
      resultCopyBtn.textContent = 'Copied';
      resultCopyBtn.classList.add('copied');
      setTimeout(() => {
        resultCopyBtn.textContent = 'Copy';
        resultCopyBtn.classList.remove('copied');
      }, 2000);
    } catch {
      if (!silent) setStatus('ERROR: Clipboard access denied', 'danger');
      else setStatus('Auto-copy unavailable — select text above to copy manually', 'muted');
    }
  }

  /**
   * Switches the result modal payload between armored text and a share link.
   * @param {'text'|'link'} mode Which format to display.
   */
  function setFormatToggle(mode) {
    if (!lastEncryptedBundle) return;
    const isLink = mode === 'link';
    formatTextBtn.classList.toggle('active', !isLink);
    formatLinkBtn.classList.toggle('active', isLink);
    formatTextBtn.setAttribute('aria-checked', isLink ? 'false' : 'true');
    formatLinkBtn.setAttribute('aria-checked', isLink ? 'true' : 'false');
    resultContentEl.value = isLink
      ? bundleToShareLink(lastEncryptedBundle)
      : formatCiphertext(lastEncryptedBundle);
    setTimeout(() => {
      resultContentEl.focus();
      resultContentEl.select();
    }, 50);
    copyResultContent({ silent: true });
  }

  /**
   * Hides the result modal and resets copy button state.
   */
  function hideResult() {
    resultOverlay.classList.remove('active');
    resultCopyBtn.textContent = 'Copy';
    resultCopyBtn.classList.remove('copied');
    lastEncryptedBundle = null;
  }

  /**
   * Invokes the platform share sheet with the current result content.
   */
  async function shareResultContent() {
    vibrate();
    const text = resultContentEl.value;
    if (!text || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ text });
    } catch (err) {
      // User canceling the share sheet throws AbortError — that's fine.
      if (err && err.name !== 'AbortError') {
        setStatus('ERROR: Share unavailable', 'danger');
      }
    }
  }

  /**
   * Switches between the Encrypt and Decrypt tabs.
   * @param {string} tabName The name of the tab to switch to ('encrypt' or 'decrypt').
   */
  function switchTab(tabName) {
    const isEncrypt = tabName === 'encrypt';
    navEncrypt.classList.toggle('active', isEncrypt);
    tabEncrypt.classList.toggle('active', isEncrypt);
    navDecrypt.classList.toggle('active', !isEncrypt);
    tabDecrypt.classList.toggle('active', !isEncrypt);
    // Update ARIA attributes
    navEncrypt.setAttribute('aria-selected', isEncrypt ? 'true' : 'false');
    navDecrypt.setAttribute('aria-selected', isEncrypt ? 'false' : 'true');
  }

  /**
   * Updates the password strength meter based on input.
   */
  function updatePasswordStrength() {
    const pass = passEl.value;
    let score = 0;
    if (pass.length > 8) score++;
    if (pass.length > 12) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    strengthEl.className = '';
    if (!pass) {
      // No password entered
    } else if (score >= 5) {
      strengthEl.classList.add('strong');
    } else if (score >= 3) {
      strengthEl.classList.add('medium');
    } else {
      strengthEl.classList.add('weak');
    }
  }

  /**
   * Resets the application to its initial state.
   */
  function resetApp() {
    ptEl.value = '';
    ctEl.value = '';
    passEl.value = '';
    // Reset touched state so textareas clear on next focus
    delete ptEl.dataset.touched;
    delete ctEl.dataset.touched;
    updatePasswordStrength();
    switchTab('encrypt');
    setStatus('System reset');
  }

  // --- Event Handlers ---

  /**
   * Handles the encryption process when the encrypt button is clicked.
   */
  async function handleEncrypt() {
    vibrate();
    try {
      const pass = passEl.value.trim();
      if (!pass) {
        return setStatus('ERROR: No passphrase set', 'danger');
      }
      const plaintext = ptEl.value.trim();
      if (!plaintext) {
        return setStatus('ERROR: No message to encrypt', 'danger');
      }
      setStatus('ENCRYPTING...');
      const bundle = await encryptMessage(pass, plaintext);
      lastEncryptedBundle = bundle;
      showResult('Encrypted', formatCiphertext(bundle), { allowFormatToggle: true });
      setStatus('ENCRYPTION COMPLETE');
    } catch (err) {
      setStatus(`ERROR: ${err.message}`, 'danger');
    }
  }

  /**
   * Handles the decryption process when the decrypt button is clicked.
   */
  async function handleDecrypt() {
    vibrate();
    const raw = ctEl.value.trim();
    if (!raw) {
      return setStatus('ERROR: No ciphertext provided', 'danger');
    }
    let bundle;
    try {
      bundle = extractBundle(raw);
    } catch {
      return setStatus('ERROR: Invalid or corrupted ciphertext', 'danger');
    }
    if (!bundle) {
      return setStatus('ERROR: Invalid or corrupted ciphertext', 'danger');
    }
    return decryptBundle(bundle);
  }

  /**
   * Decrypts an already-extracted bundle using the current passphrase.
   * @param {object} bundle The encrypted data bundle.
   */
  async function decryptBundle(bundle) {
    const pass = passEl.value.trim();
    if (!pass) {
      return setStatus('ERROR: No passphrase set', 'danger');
    }
    setStatus('DECRYPTING...');
    try {
      const msg = await decryptMessage(pass, bundle);
      showResult('Decrypted', msg);
      setStatus('DECRYPTION COMPLETE');
    } catch (err) {
      if (err.message?.startsWith('Security parameters')) {
        setStatus(`ERROR: ${err.message}`, 'danger');
      } else {
        setStatus('ERROR: Decryption failed — wrong passphrase', 'danger');
      }
    }
  }

  /**
   * Pulls a bundle out of pasted text. If found, switches to the decrypt tab,
   * fills the textarea with the original armored block, and auto-decrypts when
   * the passphrase is already set. Returns true if a bundle was handled.
   * @param {string} text The pasted text.
   * @returns {boolean} Whether a bundle was detected and handled.
   */
  function handleIncomingText(text) {
    if (!text) return false;
    let bundle;
    try {
      bundle = extractBundle(text);
    } catch {
      return false;
    }
    if (!bundle) return false;
    switchTab('decrypt');
    // Always show the canonical armored form in the textarea.
    ctEl.value = formatCiphertext(bundle);
    ctEl.dataset.touched = 'true';
    if (passEl.value.trim()) {
      decryptBundle(bundle);
    } else {
      setStatus('Encrypted message detected — enter passphrase to decrypt');
      passEl.focus();
    }
    return true;
  }

  /**
   * Inspects clipboard data on paste; if it's an encrypted message, intercepts
   * it and routes it through the decrypt flow.
   */
  function handlePasteAnywhere(e) {
    const data = e.clipboardData?.getData('text');
    if (!data) return;
    if (handleIncomingText(data)) {
      e.preventDefault();
    }
  }

  /**
   * On startup, surfaces ciphertext arriving via Web Share Target params or a
   * `#m=...` URL fragment.
   */
  function consumeInboundMessage() {
    const params = new URLSearchParams(location.search);
    const candidates = [params.get('text'), params.get('url'), params.get('title'), location.hash];
    for (const candidate of candidates) {
      if (candidate && handleIncomingText(candidate)) {
        // Strip the payload from the URL so it doesn't linger in history.
        history.replaceState(null, '', location.pathname);
        return;
      }
    }
  }

  /**
   * Toggles the visibility of the password input field.
   */
  function togglePasswordVisibility() {
    const isPassword = passEl.type === 'password';
    passEl.type = isPassword ? 'text' : 'password';
    togglePassBtn.classList.toggle('showing', isPassword);
    togglePassBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
  }

  /**
   * Initializes the application by setting up event listeners and initial states.
   */
  function init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js');
      });
    }

    // Main action buttons
    encryptBtn.addEventListener('click', handleEncrypt);
    decryptBtn.addEventListener('click', handleDecrypt);

    // Settings and utility buttons
    clearAllBtn.addEventListener('click', resetApp);
    togglePassBtn.addEventListener('click', togglePasswordVisibility);
    passEl.addEventListener('input', debounce(updatePasswordStrength, DEBOUNCE_DELAY));

    // Modal buttons and overlay
    resultCopyBtn.addEventListener('click', () => {
      vibrate();
      copyResultContent();
    });
    resultShareBtn.addEventListener('click', shareResultContent);
    resultDoneBtn.addEventListener('click', hideResult);
    resultOverlay.addEventListener('click', (e) => {
      if (e.target === resultOverlay) hideResult();
    });
    formatTextBtn.addEventListener('click', () => setFormatToggle('text'));
    formatLinkBtn.addEventListener('click', () => setFormatToggle('link'));

    // Tab navigation
    navEncrypt.addEventListener('click', () => switchTab('encrypt'));
    navDecrypt.addEventListener('click', () => switchTab('decrypt'));

    // Textarea interaction - clear on first click, reset on empty blur
    ptEl.addEventListener('focus', handleTextareaFocus);
    ctEl.addEventListener('focus', handleTextareaFocus);
    ptEl.addEventListener('blur', handleTextareaBlur);
    ctEl.addEventListener('blur', handleTextareaBlur);

    // Auto-detect encrypted content on paste — works whether the user is
    // pasting into the encrypt tab, decrypt tab, or anywhere on the page.
    document.addEventListener('paste', handlePasteAnywhere);

    // Surface payloads arriving via the OS share sheet or a share link.
    consumeInboundMessage();
  }

  /**
   * Clears textarea content on first focus for easy typing.
   * @param {Event} e The focus event.
   */
  function handleTextareaFocus(e) {
    const textarea = e.target;
    // Clear placeholder/existing text on first click for fresh input
    if (!textarea.dataset.touched) {
      textarea.value = '';
      textarea.dataset.touched = 'true';
    }
  }

  /**
   * Resets textarea touched state when empty on blur.
   * @param {Event} e The blur event.
   */
  function handleTextareaBlur(e) {
    const textarea = e.target;
    if (!textarea.value.trim()) {
      delete textarea.dataset.touched;
    }
  }

  // --- App Initialization ---
  document.addEventListener('DOMContentLoaded', init);

})();

