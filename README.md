# CIPHER

**Secure, client-side message encryption in your browser.**

CIPHER is a privacy-focused progressive web app for encrypting and decrypting personal messages using AES-256-GCM. Everything runs locally on your device — no servers, no accounts, no data collection. Install it on your phone and use it offline.

Inspired by Pearl Jam's *Given to Fly*.

[![Tests](https://img.shields.io/github/actions/workflow/status/tinkthemaker/love-encryption/test.yml?branch=main)](https://github.com/tinkthemaker/love-encryption/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable-purple)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-success)]()

---

## Features

- **Zero-trust privacy** — All cryptography runs in your browser via the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). No data ever leaves your device.
- **AES-256-GCM encryption** with PBKDF2-SHA256 key derivation (310,000 iterations).
- **Unique per message** — Random salt and IV generated for every encryption, so identical messages produce different ciphertext.
- **Downgrade protection** — Refuses to decrypt messages using fewer than 100,000 PBKDF2 iterations.
- **Installable PWA** — Add to your home screen for a native app experience.
- **Works offline** — Service worker caches everything; no internet needed after first load.
- **Passphrase strength meter** — Visual feedback on passphrase quality.
- **Three share paths** — The Copy button (armored block) is the primary path, works in any messenger. Link gives B a one-tap URL. Share uses the system share sheet. QR is reserved for in-person handoff.
- **One-tap reply** — Decrypted result has a Reply button that prefills the message and passphrase
- **Diceware passphrase generator** — One click, four random words from the EFF short wordlist (~41 bits of entropy)
- **Sharable `#d=...` links** — Recipient opens the link, ciphertext preloads into the decrypt tab
- **Zero dependencies** — No frameworks, no build tools, no npm. Pure HTML, CSS, and JavaScript.

## How It Works

CIPHER uses a **shared secret** model. You and your recipient agree on a passphrase ahead of time, then use it to encrypt and decrypt messages.

### Encrypt

1. Enter your shared passphrase in the **Passphrase** field.
2. On the **Encrypt** tab, type your message.
3. Tap **Encrypt**.
4. Copy the resulting armored ciphertext block and send it through any channel (text, email, chat, etc.).

### Decrypt

1. Enter the same passphrase in the **Passphrase** field.
2. Switch to the **Decrypt** tab.
3. Paste the armored ciphertext block you received.
4. Tap **Decrypt**.
5. The original message is displayed.

### Reply

1. After decrypting a message, tap **Reply** at the bottom of the result.
2. The encrypt tab opens with the message body prefilled and the passphrase remembered for the session.
3. Edit your reply and tap **Encrypt** — then send via **Copy** (the recommended path, works in any messenger) or **Link** (a one-tap URL for B).

### Sharing

When you encrypt, the result modal offers four ways to get the message to B:

- **Copy** (recommended) — copies the armored block to your clipboard. Works in any messenger: Signal, iMessage, WhatsApp, Discord, email, SMS. The block is plain text with a `-----BEGIN/END-----` header, so it's safely pasted anywhere.
- **Link** — copies a `https://...#d=...` URL. B opens the link, the ciphertext preloads into their decrypt tab, they just type the passphrase. One-tap open in messengers that auto-linkify, but the URL itself can show up in link previews, so use Copy for the most privacy-sensitive cases.
- **Share** — uses the system share sheet (Signal, Mail, AirDrop, etc.). Equivalent to Copy + paste into a chat.
- **QR (in person)** — generates a QR code only useful when you and B are physically together. B scans with their phone, the app opens to the decrypt tab. Don't try to share the QR digitally — scanning your own screen is not a real workflow.

For all four paths, share the passphrase with B through a *different* channel (a phone call, in person, a separate message) — never text it in the same message as the ciphertext.

### Message Format

Encrypted output is wrapped in an armored text block that can be safely pasted anywhere:

```
-----BEGIN SECRET MESSAGE-----
eyJ2Ij...QQkt...
-----END SECRET MESSAGE-----
```

The encoded payload contains the algorithm identifier, IV, salt, iteration count, and ciphertext — everything the recipient needs to decrypt (except the passphrase).

## Browser Compatibility

CIPHER relies on the Web Crypto API, the Clipboard API, and Service Workers. All three are available in every modern browser.

| Feature | Chrome | Firefox | Safari | Edge |
|---|---|---|---|---|
| Encrypt / Decrypt | 69+ | 65+ | 13.1+ | 79+ |
| Auto-copy to clipboard | 69+ | 65+ | 13.1+ | 79+ |
| Offline (Service Worker) | 69+ | 65+ | 13.1+ | 79+ |
| Install (Add to Home Screen) | 79+ | — | 16.4+ (iOS) | 79+ |

If clipboard access is denied, the encrypted or decrypted result is still displayed and can be copied manually.

## Running Locally

CIPHER requires a web server because service workers and the Clipboard API need a secure context. Opening `index.html` directly from the filesystem won't work.

**Quick options:**

```bash
# Python
python3 -m http.server 8000

# Node.js (npx, no install needed)
npx serve .

# VS Code
# Install the "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8000` in your browser.

For production, serve over HTTPS.

## Project Structure

```
index.html              Main application page
app.js                  Encryption logic and UI
crypto.js               Shared crypto module (AES-GCM, PBKDF2, base64)
version.js              Single source of truth for the app version
style.css               Styling, animations, and responsive layout
service-worker.js       Offline caching (stale-while-revalidate)
manifest.webmanifest    PWA configuration
vendor/
  qrcode.js             QR code generator (vendored, MIT)
  wordlist.js           EFF Diceware short wordlist (vendored, CC BY 3.0)
heart-192.png           App icon (192x192)
heart-512.png           App icon (512x512)
tests/
  test.mjs              Unit tests (run with `npm test`)
.github/
  workflows/
    test.yml            CI: runs `npm test` on every push and PR
LICENSE                 MIT license
SECURITY.md             Vulnerability disclosure policy
vercel.json              Vercel deployment + security headers (CSP, HSTS, etc.)
package.json             Test scripts and project metadata
IMPROVEMENTS.md          Implementation plan and audit history
```

## Security Details

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key Derivation | PBKDF2-SHA256 |
| Iterations | 310,000 |
| Min Iterations (decrypt) | 100,000 |
| Salt | 16 random bytes per message |
| IV | 12 random bytes per message |

All cryptographic operations use the browser's native `crypto.subtle` API — no custom crypto implementations.

## License

MIT — see [LICENSE](LICENSE). Made with love by Tink. Dedicated to B.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities privately.
