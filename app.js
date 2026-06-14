(() => {
  "use strict";

  // --- Import crypto primitives from shared module ---
  const {
    APP_VERSION, KDF_ITERATIONS, DEBOUNCE_DELAY,
    formatCiphertext, parseCiphertext, encryptMessage, decryptMessage,
  } = window.CipherCrypto;

  // --- DOM Element Selection ---
  const $ = sel => document.querySelector(sel);
  const passEl = $('#pass');
  const ptEl = $('#pt'), ctEl = $('#ct');
  const resultOverlay = $('#resultOverlay');
  const resultTitleEl = $('#resultTitle');
  const resultContentEl = $('#resultContent');
  const resultQrWrap = $('#resultQrWrap');
  const resultQrCanvas = $('#resultQrCanvas');
  const resultHintEl = $('#resultHint');
  const statusEl = $('#status');
  const encryptBtn = $('#encryptBtn');
  const decryptBtn = $('#decryptBtn');
  const clearAllBtn = $('#clearAllBtn');
  const togglePassBtn = $('#togglePassBtn');
  const generatePassBtn = $('#generatePassBtn');
  const resultCopyBtn = $('#resultCopyBtn');
  const resultLinkBtn = $('#resultLinkBtn');
  const resultQrBtn = $('#resultQrBtn');
  const resultReplyBtn = $('#resultReplyBtn');
  const resultDoneBtn = $('#resultDoneBtn');
  const navEncrypt = $('#nav-encrypt');
  const navDecrypt = $('#nav-decrypt');
  const tabEncrypt = $('#tab-encrypt');
  const tabDecrypt = $('#tab-decrypt');
  const strengthEl = $('#strength');
  const charCountEls = document.querySelectorAll('.char-count');

  // --- State ---
  let isProcessing = false;
  // Result-mode flags control which extra buttons are visible on the modal.
  // 'plaintext'  = decryption result (no QR/Link, but Reply)
  // 'ciphertext' = encryption result (QR + Link, no Reply)
  let lastResultMode = null;
  // Session passphrase: held only in memory for the lifetime of the page
  // (never persisted). Lets Reply prefills work without re-typing.
  // Not used for anything except the Reply shortcut.
  let sessionPassphrase = '';

  // --- Utility Functions ---

  /**
   * Creates a debounced function that delays invocation.
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

  // --- Character Count ---

  /**
   * Updates the character count display for the active textarea.
   */
  function updateCharCount() {
    const isEncrypt = isEncryptTab();
    const activeTextarea = isEncrypt ? ptEl : ctEl;
    const count = activeTextarea.value.length;
    charCountEls.forEach(el => {
      el.textContent = count > 0 ? `${count.toLocaleString()} chars` : '';
    });
  }

  // --- UI Functions ---

  /**
   * Displays a status message to the user.
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
   * Sets the processing state on action buttons.
   * Disables buttons and shows loading text during crypto operations.
   */
  function setProcessing(processing) {
    isProcessing = processing;
    encryptBtn.disabled = processing;
    decryptBtn.disabled = processing;

    if (processing) {
      // Store original text and replace with processing indicator
      encryptBtn.dataset.originalText = encryptBtn.textContent;
      decryptBtn.dataset.originalText = decryptBtn.textContent;
      encryptBtn.textContent = 'Working\u2026';
      decryptBtn.textContent = 'Working\u2026';
      encryptBtn.classList.add('processing');
      decryptBtn.classList.add('processing');
    } else {
      encryptBtn.textContent = encryptBtn.dataset.originalText || 'Encrypt';
      decryptBtn.textContent = decryptBtn.dataset.originalText || 'Decrypt';
      encryptBtn.classList.remove('processing');
      decryptBtn.classList.remove('processing');
    }
  }

  /**
   * Shows the result modal with a title, content, and mode-driven actions.
   * @param {'encrypted'|'decrypted'} mode What kind of result this is.
   *   'encrypted' shows Link/QR buttons (good for sending to B).
   *   'decrypted' shows Reply (good for continuing the conversation).
   * @param {string} content The text to show in the textarea.
   * @param {object} [opts]
   * @param {string} [opts.hint] Optional hint copy shown under the textarea.
   */
  async function showResult(mode, content, opts = {}) {
    lastResultMode = mode;
    const isEncrypted = mode === 'encrypted';
    resultTitleEl.textContent = isEncrypted ? 'Encrypted' : 'Decrypted';
    resultContentEl.value = content;
    resultOverlay.classList.add('active');

    // Auto-expand textarea to fit content
    autoExpandTextarea(resultContentEl);

    // Auto-select text for easy copying
    setTimeout(() => {
      resultContentEl.focus();
      resultContentEl.select();
    }, 100);

    // Auto-copy to clipboard
    try {
      await navigator.clipboard.writeText(content);
      resultCopyBtn.textContent = 'Copied';
      resultCopyBtn.classList.add('copied');
      setTimeout(() => {
        resultCopyBtn.textContent = 'Copy';
        resultCopyBtn.classList.remove('copied');
      }, 2000);
    } catch {
      setStatus('Auto-copy unavailable \u2014 select text above to copy manually', 'muted');
    }

    // Mode-driven extra controls
    resultLinkBtn.hidden = !isEncrypted;
    resultQrBtn.hidden = !isEncrypted;
    resultReplyBtn.hidden = isEncrypted;
    resultQrWrap.hidden = true; // hidden until QR button is toggled

    // Show contextual hint under the textarea
    if (opts.hint) {
      resultHintEl.innerHTML = opts.hint;
      resultHintEl.hidden = false;
    } else {
      resultHintEl.hidden = true;
    }
  }

  /**
   * Auto-expands a textarea to fit its content.
   */
  function autoExpandTextarea(el) {
    el.style.height = 'auto';
    const maxH = Math.min(el.scrollHeight, window.innerHeight * 0.5);
    el.style.height = Math.max(140, maxH) + 'px';
  }

  /**
   * Hides the result modal and resets all controls to default.
   */
  function hideResult() {
    resultOverlay.classList.remove('active');
    resultCopyBtn.textContent = 'Copy';
    resultCopyBtn.classList.remove('copied');
    resultContentEl.style.height = '';
    resultQrWrap.hidden = true;
    resultHintEl.hidden = true;
    lastResultMode = null;
  }

  /**
   * Encodes the current result content as a #d=... URL fragment on the
   * current page. The fragment is never sent to servers — it stays client-side.
   * @returns {string} The full shareable URL.
   */
  function buildShareLink() {
    const content = resultContentEl.value;
    if (!content) return '';
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const base = `${location.origin}${location.pathname}`;
    return `${base}#d=${encoded}`;
  }

  /**
   * Renders a QR code onto the result modal canvas. Hides the textarea
   * while the QR is showing.
   */
  function showQrCode() {
    const url = buildShareLink();
    if (!url || typeof window.qrcode !== 'function') {
      setStatus('QR code generation unavailable', 'danger');
      return;
    }
    try {
      const qr = window.qrcode(0, 'L');
      qr.addData(url);
      qr.make();
      const moduleCount = qr.getModuleCount();
      // Spec requires a 4-module white quiet zone around the QR; most
      // scanners (and decoders like OpenCV) won't find the finder
      // patterns without it. Render the quiet zone as part of the canvas.
      const quietModules = 4;
      const targetTotal = 256; // aim for ~256px output, with 4-module border
      const qrPx = targetTotal - 2 * quietModules;
      const cellSize = Math.max(1, Math.floor(qrPx / moduleCount));
      const qrActual = cellSize * moduleCount;
      const actualSize = qrActual + 2 * quietModules * cellSize;
      resultQrCanvas.width = actualSize;
      resultQrCanvas.height = actualSize;
      const ctx = resultQrCanvas.getContext('2d');
      // Fill the entire canvas white — this provides the quiet zone
      // around the QR data area.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, actualSize, actualSize);
      ctx.fillStyle = '#000000';
      const offset = quietModules * cellSize;
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              offset + c * cellSize,
              offset + r * cellSize,
              cellSize,
              cellSize,
            );
          }
        }
      }
      resultContentEl.hidden = true;
      resultQrWrap.hidden = false;
    } catch (err) {
      setStatus(`ERROR: ${err.message}`, 'danger');
    }
  }

  /**
   * Hides the QR code and shows the textarea again.
   */
  function hideQrCode() {
    resultQrWrap.hidden = true;
    resultContentEl.hidden = false;
  }

  /**
   * Copies the shareable #d= URL to the clipboard (not just the ciphertext).
   * Useful when the recipient is on the same network or you'll send them a link.
   */
  async function copyShareLink() {
    const url = buildShareLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      resultLinkBtn.textContent = 'Copied';
      resultLinkBtn.classList.add('copied');
      setTimeout(() => {
        resultLinkBtn.textContent = 'Link';
        resultLinkBtn.classList.remove('copied');
      }, 1500);
    } catch {
      setStatus('ERROR: Clipboard access denied', 'danger');
    }
  }

  /**
   * Fills the encrypt tab with the just-decrypted message, switches to it,
   * and seeds the passphrase field with the session passphrase (so a Reply
   * is one click away). Cleared if the user edits the passphrase.
   */
  function replyWithDecrypted() {
    const replyText = resultContentEl.value;
    if (!replyText) return;
    // Hide modal first so the textarea reflow doesn't look broken
    hideResult();
    // Switch to encrypt tab
    switchTab('encrypt');
    // Prefill the message and passphrase (in-memory only)
    ptEl.value = replyText;
    if (sessionPassphrase) passEl.value = sessionPassphrase;
    updateCharCount();
    setStatus('Ready to reply \u2014 tweak the message and press Enter', 'muted');
    ptEl.focus();
  }

  /**
   * On page load: if the URL fragment contains a #d=... payload, treat it
   * as a shared ciphertext, prefill the decrypt textarea, and switch tabs.
   * The fragment is then cleared from the address bar so it doesn't linger
   * in browser history or get bookmarked.
   */
  function consumeShareFragment() {
    const hash = location.hash || '';
    const match = hash.match(/^#d=(.+)$/);
    if (!match) return;
    try {
      const decoded = decodeURIComponent(escape(atob(match[1])));
      // Validate quickly: must look like one of our armored blocks
      if (decoded.includes('-----BEGIN SECRET MESSAGE-----') &&
          decoded.includes('-----END SECRET MESSAGE-----')) {
        ctEl.value = decoded;
        switchTab('decrypt');
        setStatus('Encrypted message loaded \u2014 type the passphrase and press Enter', 'muted');
      }
    } catch {
      // Bad fragment, ignore silently
    }
    // Clear the fragment from the address bar
    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      location.hash = '';
    }
  }

  /**
   * Switches between the Encrypt and Decrypt tabs.
   * Updates labels and character count to match active tab.
   */
  function switchTab(tabName) {
    const isEncrypt = tabName === 'encrypt';
    navEncrypt.classList.toggle('active', isEncrypt);
    tabEncrypt.classList.toggle('active', isEncrypt);
    tabDecrypt.classList.toggle('active', !isEncrypt);
    navDecrypt.classList.toggle('active', !isEncrypt);
    navEncrypt.setAttribute('aria-selected', isEncrypt ? 'true' : 'false');
    navDecrypt.setAttribute('aria-selected', isEncrypt ? 'false' : 'true');

    // Update button labels
    encryptBtn.textContent = 'Encrypt';
    decryptBtn.textContent = 'Decrypt';

    // Update dynamic labels and placeholders based on active tab
    const ptLabel = document.querySelector('label[for="pt"]');
    const ctLabel = document.querySelector('label[for="ct"]');
    if (ptLabel) ptLabel.textContent = isEncrypt ? 'Input Message' : 'Plaintext';
    if (ctLabel) ctLabel.textContent = isEncrypt ? 'Encrypted Data' : 'Paste Encrypted Message';

    // Update placeholders to match context
    ptEl.placeholder = isEncrypt ? 'Type your secret message here\u2026' : 'Type the message you want to protect\u2026';
    ctEl.placeholder = isEncrypt ? 'Paste encrypted message here\u2026' : 'Paste the encrypted message you received\u2026';

    // Update character count for active textarea
    updateCharCount();
  }

  /**
   * Returns whether the encrypt tab is currently active.
   */
  function isEncryptTab() {
    return navEncrypt.classList.contains('active');
  }

  /**
   * Updates the password strength meter based on input.
   * Sets aria-valuetext for screen reader accessibility.
   *
   * Scoring: 0-6 points based on length, character class diversity.
   * Multi-word diceware-style passphrases (3+ words separated by
   * hyphens or spaces) get a bonus — they don't have upper-case or
   * digits, but they have high entropy.
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
    // Multi-word passphrase bonus (e.g. "word1-word2-word3-word4").
    // Count words by splitting on spaces or hyphens; 3+ words = +1.
    const wordCount = (pass.match(/[\s\-]+/g) || []).length + (pass ? 1 : 0);
    if (wordCount >= 3) score += 1;

    strengthEl.className = '';
    let label = '';
    if (!pass) {
      // No password entered
      strengthEl.removeAttribute('aria-valuetext');
    } else if (score >= 5) {
      strengthEl.classList.add('strong');
      label = 'Strong';
    } else if (score >= 3) {
      strengthEl.classList.add('medium');
      label = 'Medium';
    } else {
      strengthEl.classList.add('weak');
      label = 'Weak';
    }
    if (label) {
      strengthEl.setAttribute('aria-valuetext', label);
    }
  }

  /**
   * Resets the application to its initial state.
   * Requires double-click confirmation to prevent accidental data loss.
   * Also wipes the in-memory session passphrase.
   */
  let resetConfirmTimeout = null;
  function resetApp() {
    // If there's nothing to clear, just reset the button state
    const hasContent = passEl.value || ptEl.value || ctEl.value;
    if (!hasContent) {
      clearAllBtn.textContent = 'Clear All';
      clearAllBtn.classList.remove('confirm');
      return;
    }

    // First click: ask for confirmation
    if (!clearAllBtn.classList.contains('confirm')) {
      clearAllBtn.textContent = 'Confirm Clear?';
      clearAllBtn.classList.add('confirm');

      // Reset button after 3 seconds if no second click
      resetConfirmTimeout = setTimeout(() => {
        clearAllBtn.textContent = 'Clear All';
        clearAllBtn.classList.remove('confirm');
      }, 3000);
      return;
    }

    // Second click: confirmed
    clearTimeout(resetConfirmTimeout);
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.classList.remove('confirm');

    ptEl.value = '';
    ctEl.value = '';
    passEl.value = '';
    sessionPassphrase = ''; // forget the in-memory passphrase
    updatePasswordStrength();
    switchTab('encrypt');
    setStatus('System reset');
  }

  // --- Event Handlers ---

  /**
   * Handles the encryption process when the encrypt button is clicked.
   */
  async function handleEncrypt() {
    if (isProcessing) return;
    vibrate();
    try {
      const pass = passEl.value.trim();
      if (!pass) {
        return setStatus('Type the passphrase you and B agreed on first', 'danger');
      }
      const plaintext = ptEl.value.trim();
      if (!plaintext) {
        return setStatus('Type the message you want to protect', 'danger');
      }
      setProcessing(true);
      setStatus('ENCRYPTING...');
      const bundle = await encryptMessage(pass, plaintext);
      const formattedCiphertext = formatCiphertext(bundle);
      // Remember the passphrase in memory for the Reply shortcut.
      // Never persisted, cleared on tab close or Clear All.
      sessionPassphrase = pass;
      showResult('encrypted', formattedCiphertext, {
        hint: 'Paste this in any messenger. <strong>Send the passphrase to B separately</strong> \u2014 in person, on a call, or in a different message. Never text it with the message.',
      });
      setStatus('ENCRYPTION COMPLETE');
      // Auto-clear the plaintext from the input so it doesn't sit on screen
      ptEl.value = '';
      updateCharCount();
    } catch (err) {
      setStatus(`ERROR: ${err.message}`, 'danger');
    } finally {
      setProcessing(false);
    }
  }

  /**
   * Handles the decryption process when the decrypt button is clicked.
   */
  async function handleDecrypt() {
    if (isProcessing) return;
    vibrate();
    try {
      const pass = passEl.value.trim();
      if (!pass) {
        return setStatus('Type the passphrase you and B agreed on first', 'danger');
      }
      const raw = ctEl.value.trim();
      if (!raw) {
        return setStatus('Paste the encrypted message B sent you', 'danger');
      }
      let bundle;
      try {
        bundle = parseCiphertext(raw);
      } catch {
        return setStatus("That doesn't look like a CIPHER message \u2014 check the BEGIN/END markers", 'danger');
      }
      setProcessing(true);
      setStatus('DECRYPTING...');
      const msg = await decryptMessage(pass, bundle);
      // Remember the passphrase in memory for the Reply shortcut
      sessionPassphrase = pass;
      showResult('decrypted', msg, {
        hint: 'Tap <strong>Reply</strong> below to send a message back. The passphrase stays in memory for this tab only \u2014 close the tab and it\u2019s gone.',
      });
      setStatus('DECRYPTION COMPLETE');
    } catch (err) {
      if (err.message?.startsWith('Security parameters')) {
        setStatus(`ERROR: ${err.message}`, 'danger');
      } else {
        setStatus("Couldn\u2019t decrypt \u2014 double-check the passphrase and try again", 'danger');
      }
    } finally {
      setProcessing(false);
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
   * Generates a random passphrase using EFF Diceware short wordlist.
   * Uses crypto.getRandomValues for unbiased selection.
   * @param {number} [wordCount=4] Number of words (4 = ~41 bits, 5 = ~52 bits)
   * @returns {string} Hyphen-separated passphrase
   */
  function generatePassphrase(wordCount = 4) {
    const list = window.EFF_DICEWARE_SHORT;
    if (!list || !Array.isArray(list) || list.length === 0) {
      throw new Error('Word list not loaded');
    }
    const words = [];
    // For each word, need log2(list.length) bits = log2(1296) = 10.34 bits.
    // Use rejection sampling: draw 16 bits at a time, reject >= 1296.
    const max = list.length;
    const randBuf = new Uint16Array(wordCount);
    crypto.getRandomValues(randBuf);
    for (let i = 0; i < wordCount; i++) {
      // Reject any value >= 1296 to avoid modulo bias
      // 65536 / 1296 = 50.57, so 50 * 1296 = 64800 max safe value
      let n = randBuf[i];
      while (n >= 50 * max) {
        const r = new Uint16Array(1);
        crypto.getRandomValues(r);
        n = r[0];
      }
      words.push(list[n % max]);
    }
    return words.join('-');
  }

  /**
   * Click handler for the Generate button. Creates a fresh passphrase,
   * places it in the passphrase field, makes it visible so the user can
   * read and copy it, and refreshes the strength meter.
   */
  function handleGeneratePassphrase() {
    try {
      const pass = generatePassphrase(4);
      passEl.value = pass;
      // Show the passphrase so the user can read it to share
      passEl.type = 'text';
      togglePassBtn.classList.add('showing');
      togglePassBtn.setAttribute('aria-pressed', 'true');
      updatePasswordStrength();
      passEl.focus();
      passEl.select();
      setStatus('Fresh passphrase generated \u2014 share it with B on a call, then hide it', 'muted');
    } catch (err) {
      setStatus(`ERROR: ${err.message}`, 'danger');
    }
  }

  /**
   * Copies the content of the result modal to the clipboard.
   */
  async function copyResultToClipboard() {
    vibrate();
    const contentToCopy = resultContentEl.value;
    if (!contentToCopy) return;
    try {
      await navigator.clipboard.writeText(contentToCopy);
      resultCopyBtn.textContent = 'Copied';
      resultCopyBtn.classList.add('copied');
      setTimeout(() => {
        resultCopyBtn.textContent = 'Copy';
        resultCopyBtn.classList.remove('copied');
      }, 1500);
    } catch {
      setStatus('ERROR: Clipboard access denied', 'danger');
    }
  }

  /**
   * Shares the result content using the Web Share API if available,
   * falls back to copying to clipboard.
   */
  async function shareResult() {
    const contentToShare = resultContentEl.value;
    if (!contentToShare) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: contentToShare });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    await copyResultToClipboard();
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

    // Hide Share button when Web Share API is not available
    if (!navigator.share) {
      document.body.classList.add('no-share-api');
    }

    // Main action buttons
    encryptBtn.addEventListener('click', handleEncrypt);
    decryptBtn.addEventListener('click', handleDecrypt);

    // Clear All (requires double-click confirmation)
    clearAllBtn.addEventListener('click', resetApp);
    togglePassBtn.addEventListener('click', togglePasswordVisibility);
    generatePassBtn.addEventListener('click', handleGeneratePassphrase);
    passEl.addEventListener('input', debounce(updatePasswordStrength, DEBOUNCE_DELAY));

    // Character count on textarea input
    ptEl.addEventListener('input', updateCharCount);
    ctEl.addEventListener('input', updateCharCount);

    // Modal buttons and overlay
    resultCopyBtn.addEventListener('click', copyResultToClipboard);
    resultLinkBtn.addEventListener('click', copyShareLink);
    resultQrBtn.addEventListener('click', () => {
      if (resultQrWrap.hidden) showQrCode();
      else hideQrCode();
    });
    resultReplyBtn.addEventListener('click', replyWithDecrypted);
    resultDoneBtn.addEventListener('click', hideResult);
    resultOverlay.addEventListener('click', (e) => {
      if (e.target === resultOverlay) hideResult();
    });

    // Share button
    const resultShareBtn = $('#resultShareBtn');
    if (resultShareBtn) {
      resultShareBtn.addEventListener('click', shareResult);
    }

    // Tab navigation
    navEncrypt.addEventListener('click', () => switchTab('encrypt'));
    navDecrypt.addEventListener('click', () => switchTab('decrypt'));

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // On load: if the page was opened via a #d=... share link, consume it.
    consumeShareFragment();
  }

  /**
   * Global keyboard shortcut handler.
   */
  function handleKeyboard(e) {
    // Escape closes the result modal
    if (e.key === 'Escape' && resultOverlay.classList.contains('active')) {
      e.preventDefault();
      hideResult();
      return;
    }

    // Enter triggers encrypt/decrypt (but not inside a textarea)
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (resultOverlay.classList.contains('active')) {
        hideResult();
      } else if (isEncryptTab()) {
        handleEncrypt();
      } else {
        handleDecrypt();
      }
    }
  }

  // --- App Initialization ---
  document.addEventListener('DOMContentLoaded', init);

})();