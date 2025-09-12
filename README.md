Given to Fly ♥
A beautiful, private, and secure web app for encrypting personal messages.

Inspired by the Pearl Jam song of the same name, "Given to Fly" is a tool for sending secret messages that are meant to be cherished. It uses strong, modern cryptography that runs entirely in your browser, ensuring that your private notes remain private. No data is ever sent to a server.

It's designed to be installed on your phone as a Progressive Web App (PWA) for a seamless, native-app experience, and it even works offline.

Features

Completely Private: All encryption and decryption happens locally on your device. Nothing is ever uploaded.

Strong Encryption: Uses the industry-standard Web Crypto API with AES-256-GCM and PBKDF2 (310,000 iterations) for robust security.

Progressive Web App (PWA): Installable on your phone's home screen for easy access.

Works Offline: Once installed, the app works perfectly without an internet connection.

Beautiful & Simple UI: A clean, mobile-first interface with a tab-based design, animated background, and interactive effects.

Usability Features: Includes a passphrase strength meter and a show/hide toggle to prevent typos.

How to Use

The app works on a shared secret model. You and your recipient must agree on the exact same passphrase beforehand.

To Send a Message:

Open the app and tap "⚙️ Settings".

Enter your secret passphrase.

On the "Encrypt" tab, type your message in the text area.

Tap the "Encrypt & Lock" button.

A modal will appear with the encrypted ciphertext. Tap "Copy" and send this block of text to your recipient via any messaging service.

To Read a Message:

Open the app and tap "⚙️ Settings".

Enter the secret passphrase you agreed upon.

Switch to the "Decrypt" tab.

Paste the encrypted text you received into the message box.

Tap the "Decrypt & Reveal" button.

The original secret message will be revealed in a modal.

Technical Setup

To run this app, you need to serve the files from a web server. You cannot simply open the index.html file directly in your browser, as PWA features like service workers require a secure (HTTPS) context.

Place Files: Ensure index.html, manifest.webmanifest, and service-worker.js are in the same directory.

Add Icons: Create and add heart-192.png (192x192) and heart-512.png (512x512) to the same directory.

Serve: Use a simple local web server. A great tool for this is the Live Server extension for Visual Studio Code.

Dedicated to the love of my life B. -Tink

