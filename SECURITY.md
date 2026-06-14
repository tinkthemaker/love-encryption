# Security

If you have discovered a security vulnerability in CIPHER, please report
it privately. **Do not open a public GitHub issue.**

## Reporting a vulnerability

Email: tinkthemaker@proton.me
Expected response: within 7 days.

Please include:
- A description of the vulnerability and its impact
- Reproduction steps
- A proof-of-concept (PoC) if possible

## Scope

CIPHER is a client-side message encryption PWA. The cryptographic
implementation lives in `crypto.js`. Anything that would let a third
party recover plaintext from a `-----BEGIN SECRET MESSAGE-----` block
without knowing the passphrase is in scope.
