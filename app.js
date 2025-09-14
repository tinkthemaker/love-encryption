// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}

// DOM Elements
const $ = sel => document.querySelector(sel);
const passEl = $('#pass');
const ptEl = $('#pt'), ctEl = $('#ct');
const strengthBar = $('#strength-bar');
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

// Constants
const KDF_ITERATIONS = 310000;
const instructionText = "Set a passphrase in Settings, type your message, then encrypt.";

// Utility functions
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = {
  to: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replaceAll('\n',''),
  from: str => Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer
};
const rand = n => crypto.getRandomValues(new Uint8Array(n));

// --- Haptic Feedback Function ---
function vibrate() {
  if ('vibrate' in navigator) {
    navigator.vibrate(50); // Vibrate for 50 milliseconds
  }
}

// --- Core Crypto Functions ---
async function deriveKey(pass, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptMessage(pass, plaintext) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await deriveKey(pass, salt, KDF_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { v: 1, alg: 'AES-GCM-256/PBKDF2-SHA256', iv: b64.to(iv), salt: b64.to(salt), iters: KDF_ITERATIONS, ct: b64.to(ct) };
}

async function decryptMessage(pass, bundle) {
  const iv = b64.from(bundle.iv);
  const salt = b64.from(bundle.salt);
  const iterations = Number(bundle.iters || KDF_ITERATIONS);
  const key = await deriveKey(pass, salt, iterations);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64.from(bundle.ct));
  return dec.decode(ptBuf);
}

// --- UI Functions ---
function setStatus(msg, type = 'muted') {
  statusEl.textContent = msg;
  statusEl.className = 'status';
  if (type !== 'muted') statusEl.classList.add(type);
  
  // Add the visible class to trigger the animation
  if (msg) {
    statusEl.classList.add('visible');
  } else {
    statusEl.classList.remove('visible');
  }
}

function showResult(title, content) {
  resultTitleEl.textContent = title;
  resultContentEl.value = content;
  resultOverlay.classList.add('active');
}

function hideResult() {
  resultOverlay.classList.remove('active');
}

function switchTab(tabName) {
  navEncrypt.classList.remove('active');
  tabEncrypt.classList.remove('active');
  navDecrypt.classList.remove('active');
  tabDecrypt.classList.remove('active');

  if (tabName === 'encrypt') {
    navEncrypt.classList.add('active');
    tabEncrypt.classList.add('active');
  } else {
    navDecrypt.classList.add('active');
    tabDecrypt.classList.add('active');
  }
}

function updatePasswordStrength() {
  const pass = passEl.value;
  let score = 0;
  if (pass.length > 8) score++;
  if (pass.length > 12) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[a-z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  
  const scorePercent = (score / 6) * 100;
  strengthBar.className = '';
  if (scorePercent > 75) {
    strengthBar.classList.add('strong');
  } else if (scorePercent > 40) {
    strengthBar.classList.add('medium');
  }
  strengthBar.style.width = `${scorePercent}%`;
}

function resetApp() {
  ptEl.value = instructionText;
  ptEl.style.color = 'var(--muted)';
  ctEl.value = '';
  passEl.value = '';
  updatePasswordStrength();
  switchTab('encrypt');
  setStatus('App has been reset.');
  settingsDetails.removeAttribute('open');
}

// --- Event Handlers ---
async function handleEncrypt() {
  vibrate();
  try {
    const pass = passEl.value.trim();
    if (!pass) {
      setStatus('Please set a passphrase in Settings.', 'danger');
      return;
    }
    const plaintext = ptEl.value.trim();
    if (!plaintext || plaintext === instructionText) {
      setStatus('Please write a message to encrypt.', 'danger');
      return;
    }
    setStatus('Locking your secret...');
    const bundle = await encryptMessage(pass, plaintext);
    showResult('Secret Message Ready', JSON.stringify(bundle, null, 2));
    setStatus('Your message is now encrypted.');
  } catch (err) {
    setStatus(`Encryption failed: ${err.message}`, 'danger');
  }
}

async function handleDecrypt() {
  vibrate();
  try {
    const pass = passEl.value.trim();
    if (!pass) {
      setStatus('Please set a passphrase in Settings.', 'danger');
      return;
    }
    const raw = ctEl.value.trim();
    if (!raw) {
      setStatus('Please paste a message to decrypt.', 'danger');
      return;
    }
    let bundle;
    try {
      bundle = JSON.parse(raw);
    } catch {
      setStatus('Ciphertext is not valid JSON.', 'danger');
      return;
    }
    setStatus('Unlocking your secret...');
    const msg = await decryptMessage(pass, bundle);
    showResult('Message Revealed!', msg);
    setStatus('Decryption successful!');
  } catch (err) {
    setStatus('Decryption failed. Wrong passphrase or corrupted data.', 'danger');
  }
}

function togglePasswordVisibility() {
    const isPassword = passEl.type === 'password';
    passEl.type = isPassword ? 'text' : 'password';
    togglePassBtn.textContent = isPassword ? '🙈' : '👁️';
}

async function copyResultToClipboard(e) {
    vibrate();
    const contentToCopy = resultContentEl.value;
    if (!contentToCopy) return;
    try {
        await navigator.clipboard.writeText(contentToCopy);
        const btn = e.currentTarget;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1500);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

// --- Event Listeners ---
encryptBtn.addEventListener('click', handleEncrypt);
decryptBtn.addEventListener('click', handleDecrypt);
clearAllBtn.addEventListener('click', resetApp);
togglePassBtn.addEventListener('click', togglePasswordVisibility);
passEl.addEventListener('input', updatePasswordStrength);
resultCopyBtn.addEventListener('click', copyResultToClipboard);
resultDoneBtn.addEventListener('click', hideResult);
resultOverlay.addEventListener('click', (e) => {
  if (e.target === resultOverlay) hideResult();
});
navEncrypt.addEventListener('click', () => switchTab('encrypt'));
navDecrypt.addEventListener('click', () => switchTab('decrypt'));

// --- Placeholder Logic ---
ptEl.addEventListener('focus', () => {
  if (ptEl.value === instructionText) {
    ptEl.value = '';
    ptEl.style.color = 'var(--text)';
  }
});

ptEl.addEventListener('blur', () => {
  if (ptEl.value.trim() === '') {
    ptEl.value = instructionText;
    ptEl.style.color = 'var(--muted)';
  }
});

// Clear decrypt box on focus
ctEl.addEventListener('focus', () => {
  ctEl.value = '';
});

// Set initial placeholder color
document.addEventListener('DOMContentLoaded', () => {
  if (ptEl.value === instructionText) {
    ptEl.style.color = 'var(--muted)';
  }
});

