// app.js
import { encrypt as encJS, decrypt as decJS } from './lovecrypto-browser.js';

const $ = s => document.querySelector(s);
const passEl = $('#pass'), saltEl = $('#salt'), itersEl= $('#iters');
const ptEl = $('#pt'), ctEl = $('#ct');
const status = $('#status'), statusKdf = $('#statusKdf');
const strengthBar = $('#strength-bar');
const encryptBtn = $('#encryptBtn'), decryptBtn = $('#decryptBtn');
const encryptSticky = $('#encryptSticky'), decryptSticky = $('#decryptSticky');

const setStatus = (el, msg, type='muted') => {
  el.textContent = msg;
  el.className = 'status';
  if (type !== 'muted') el.classList.add(type);
};

async function doEncrypt(){
  encryptBtn.disabled = true; encryptBtn.classList.add('working');
  try{
    const pass = passEl.value.trim();
    if(!pass) return setStatus(status,'⚠️ Enter a passphrase.','warn');
    const iters = Math.max(100000, Number(itersEl.value)||200000);
    const plaintext = ptEl.value;
    if(!plaintext) return setStatus(status,'⚠️ Type a message to encrypt.','warn');

    setStatus(status,'Encrypting…');
    const bundle = await encJS(pass, plaintext, iters);
    ctEl.value = JSON.stringify(bundle, null, 2);
    saltEl.value = bundle.salt;
    setStatus(status,'✅ Encrypted successfully.','ok');
    ctEl.scrollIntoView({behavior:'smooth', block:'center'});
  }catch(e){ setStatus(status,'❌ '+e.message,'danger'); }
  finally{ encryptBtn.disabled=false; encryptBtn.classList.remove('working'); }
}

async function doDecrypt(){
  decryptBtn.disabled = true; decryptBtn.classList.add('working');
  try{
    const pass = passEl.value.trim();
    if(!pass) return setStatus(status,'⚠️ Enter the passphrase.','warn');
    let bundle; try{ bundle = JSON.parse(ctEl.value.trim()); }
    catch{ return setStatus(status,'❌ Ciphertext must be JSON.','danger'); }

    setStatus(status,'Decrypting…');
    const msg = await decJS(pass, bundle);
    ptEl.value = msg;
    if (bundle.salt) saltEl.value = bundle.salt;
    if (bundle.iters) itersEl.value = Number(bundle.iters);
    setStatus(status,'✅ Decrypted successfully.','ok');
    ptEl.scrollIntoView({behavior:'smooth', block:'center'});
  }catch(e){ setStatus(status,'❌ Wrong passphrase or corrupted data.','danger'); }
  finally{ decryptBtn.disabled=false; decryptBtn.classList.remove('working'); }
}

// UI events
$('#togglePass').addEventListener('click', ()=>{ passEl.type = passEl.type==='password' ? 'text':'password'; });
$('#genPass').addEventListener('click', ()=>{
  const syll = ['la','no','ve','ri','ta','mo','na','li','ra','sa','mi','el','do','re','na','ka','shi','lo','zu','fi'];
  const words = Array.from({length:6},()=>Array.from({length:3},()=>syll[Math.random()*syll.length|0]).join(''));
  passEl.value = words.join('-'); passEl.dispatchEvent(new Event('input'));
  setStatus(statusKdf,'💡 Generated a random passphrase.','warn');
});

encryptBtn.addEventListener('click', doEncrypt);
decryptBtn.addEventListener('click', doDecrypt);
encryptSticky.addEventListener('click', doEncrypt);
decryptSticky.addEventListener('click', doDecrypt);

// Copy/save/open helpers (same as your version)…
