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
  const strengthEl = $('#strength');
  const charCountEls = document.querySelectorAll('.char-count');

  // --- State ---
  let isProcessing = false;

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
      encryptBtn.textContent = isEncryptTab() ? 'Working\u2026' : 'Working\u2026';
      decryptBtn.textContent = isEncryptTab() ? 'Working\u2026' : 'Working\u2026';
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
   * Shows the result modal with a title and content.
   * Auto-copies to clipboard and selects text for user convenience.
   * Auto-expands the textarea to fit content.
   */
  async function showResult(title, content) {
    resultTitleEl.textContent = title;
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
   * Hides the result modal and resets copy button state.
   */
  function hideResult() {
    resultOverlay.classList.remove('active');
    resultCopyBtn.textContent = 'Copy';
    resultCopyBtn.classList.remove('copied');
    resultContentEl.style.height = '';
  }

  /**
   * Switches between the Encrypt and Decrypt tabs.
   * Updates labels and character count to match active tab.
   */
  function switchTab(tabName) {
    const isEncrypt = tabName === 'encrypt';
    navEncrypt.classList.toggle('active', isEncrypt);
    tabEncrypt.classList.toggle('active', isEncrypt);
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
        return setStatus('ERROR: No passphrase set', 'danger');
      }
      const plaintext = ptEl.value.trim();
      if (!plaintext) {
        return setStatus('ERROR: No message to encrypt', 'danger');
      }
      setProcessing(true);
      setStatus('ENCRYPTING...');
      const bundle = await encryptMessage(pass, plaintext);
      const formattedCiphertext = formatCiphertext(bundle);
      showResult('Encrypted', formattedCiphertext);
      setStatus('ENCRYPTION COMPLETE');
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
      setProcessing(true);
      setStatus('DECRYPTING...');
      const msg = await decryptMessage(pass, bundle);
      showResult('Decrypted', msg);
      setStatus('DECRYPTION COMPLETE');
    } catch (err) {
      if (err.message?.startsWith('Security parameters')) {
        setStatus(`ERROR: ${err.message}`, 'danger');
      } else {
        setStatus('ERROR: Decryption failed \u2014 wrong passphrase', 'danger');
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
    passEl.addEventListener('input', debounce(updatePasswordStrength, DEBOUNCE_DELAY));

    // Character count on textarea input
    ptEl.addEventListener('input', updateCharCount);
    ctEl.addEventListener('input', updateCharCount);

    // Modal buttons and overlay
    resultCopyBtn.addEventListener('click', copyResultToClipboard);
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