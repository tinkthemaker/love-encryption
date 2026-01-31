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
  const resultDoneBtn = $('#resultDoneBtn');
  const navEncrypt = $('#nav-encrypt');
  const navDecrypt = $('#nav-decrypt');
  const tabEncrypt = $('#tab-encrypt');
  const tabDecrypt = $('#tab-decrypt');
  const settingsDetails = $('.settings');

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
    // Validate required fields
    if (!bundle.iv || !bundle.salt || !bundle.ct) {
      throw new Error('Missing required encryption data');
    }
    return bundle;
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
   * @param {string} title The title for the modal.
   * @param {string} content The content for the modal's textarea.
   */
  function showResult(title, content) {
    resultTitleEl.textContent = title;
    resultContentEl.value = content;
    resultOverlay.classList.add('active');
  }

  /**
   * Hides the result modal.
   */
  function hideResult() {
    resultOverlay.classList.remove('active');
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
    updatePasswordStrength();
    switchTab('encrypt');
    setStatus('SYSTEM RESET');
    settingsDetails.removeAttribute('open');
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
      const formattedCiphertext = formatCiphertext(bundle);
      showResult('OUTPUT // ENCRYPTED', formattedCiphertext);
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
    try {
      const pass = passEl.value.trim();
      if (!pass) {
        return setStatus('ERROR: No passphrase set', 'danger');
      }
      const raw = ctEl.value.trim();
      if (!raw) {
        return setStatus('ERROR: No ciphertext provided', 'danger');
      }
      let bundle;
      try {
        bundle = parseCiphertext(raw);
      } catch {
        return setStatus('ERROR: Invalid or corrupted ciphertext', 'danger');
      }
      setStatus('DECRYPTING...');
      const msg = await decryptMessage(pass, bundle);
      showResult('OUTPUT // DECRYPTED', msg);
      setStatus('DECRYPTION COMPLETE');
    } catch (err) {
      setStatus('ERROR: Decryption failed - invalid passphrase', 'danger');
    }
  }

  /**
   * Toggles the visibility of the password input field.
   */
  function togglePasswordVisibility() {
    const isPassword = passEl.type === 'password';
    passEl.type = isPassword ? 'text' : 'password';
    togglePassBtn.textContent = isPassword ? 'Hide' : 'Show';
    togglePassBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
  }

  /**
   * Copies the content of the result modal to the clipboard.
   * @param {Event} e The click event object.
   */
  async function copyResultToClipboard(e) {
    vibrate();
    const contentToCopy = resultContentEl.value;
    if (!contentToCopy) return;
    try {
      await navigator.clipboard.writeText(contentToCopy);
      const btn = e.currentTarget;
      const originalText = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1500);
    } catch (err) {
      console.error('Failed to copy: ', err);
      setStatus('ERROR: Clipboard access denied', 'danger');
    }
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
    resultCopyBtn.addEventListener('click', copyResultToClipboard);
    resultDoneBtn.addEventListener('click', hideResult);
    resultOverlay.addEventListener('click', (e) => {
      if (e.target === resultOverlay) hideResult();
    });
    
    // Tab navigation
    navEncrypt.addEventListener('click', () => switchTab('encrypt'));
    navDecrypt.addEventListener('click', () => switchTab('decrypt'));
  }

  // --- App Initialization ---
  document.addEventListener('DOMContentLoaded', init);

})();

