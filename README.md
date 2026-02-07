# CIPHER

**Secure, client-side message encryption in your browser.**

CIPHER is a privacy-focused progressive web app for encrypting and decrypting personal messages using AES-256-GCM. Everything runs locally on your device — no servers, no accounts, no data collection. Install it on your phone and use it offline.

Inspired by Pearl Jam's *Given to Fly*.

---

## Features

- **Zero-trust privacy** — All cryptography runs in your browser via the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). No data ever leaves your device.
- **AES-256-GCM encryption** with PBKDF2-SHA256 key derivation (310,000 iterations).
- **Unique per message** — Random salt and IV generated for every encryption, so identical messages produce different ciphertext.
- **Downgrade protection** — Refuses to decrypt messages using fewer than 100,000 PBKDF2 iterations.
- **Installable PWA** — Add to your home screen for a native app experience.
- **Works offline** — Service worker caches everything; no internet needed after first load.
- **Passphrase strength meter** — Visual feedback on passphrase quality.
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

### Message Format

Encrypted output is wrapped in an armored text block that can be safely pasted anywhere:

```
-----BEGIN SECRET MESSAGE-----
eyJ2IjoyLCJhbGciOiJBRVMtR0NNLTI1Ni9QQkt...
-----END SECRET MESSAGE-----
```

The encoded payload contains the algorithm identifier, IV, salt, iteration count, and ciphertext — everything the recipient needs to decrypt (except the passphrase).

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
style.css               Styling, animations, and responsive layout
service-worker.js       Offline caching (stale-while-revalidate)
manifest.webmanifest    PWA configuration
heart-192.png           App icon (192x192)
heart-512.png           App icon (512x512)
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

Made with love by Tink. Dedicated to B.
