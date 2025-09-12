// Crypto module (ESM) for browser
export async function encrypt(pass, plaintext, iterations = 200000) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iterations);
  const ctBuf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(plaintext));
  return { v:1, alg:'AES-GCM-256/PBKDF2-SHA256', iv: b64e(iv), salt: b64e(salt), iters: iterations, ct: b64e(new Uint8Array(ctBuf)) };
}
export async function decrypt(pass, bundle){
  const dec = new TextDecoder();
  const iv = b64d(bundle.iv);
  const salt = b64d(bundle.salt);
  const key = await deriveKey(pass, salt, Number(bundle.iters||200000));
  const ptBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, b64d(bundle.ct));
  return dec.decode(ptBuf);
}
async function deriveKey(pass, salt, iterations){
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', hash:'SHA-256', salt, iterations }, keyMat, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
const b64e = u8 => btoa(String.fromCharCode(...u8));
const b64d = str => Uint8Array.from(atob(str), c=>c.charCodeAt(0));
