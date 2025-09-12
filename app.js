import { encrypt as encJS, decrypt as decJS } from './lovecrypto-browser.js';

const $ = s => document.querySelector(s);
const passEl = $('#pass'), itersEl= $('#iters');
const ptEl = $('#pt'), ctEl = $('#ct');
const status = $('#status');
const encryptBtn = $('#encryptBtn'), decryptBtn = $('#decryptBtn');
const encryptSticky = $('#encryptSticky'), decryptSticky = $('#decryptSticky');

const setStatus = (msg, type='muted') => { status.textContent = msg; status.className = type; };

async function doEncrypt(){
  try{
    const pass = passEl.value.trim();
    if(!pass) return setStatus('⚠️ Enter a passphrase','warn');
    const iters = Math.max(100000, Number(itersEl.value)||200000);
    const plaintext = ptEl.value;
    if(!plaintext) return setStatus('⚠️ Nothing to encrypt','warn');
    setStatus('Encrypting…');
    const bundle = await encJS(pass, plaintext, iters);
    ctEl.value = JSON.stringify(bundle, null, 2);
    setStatus('✅ Encrypted successfully','ok');
  }catch(e){ setStatus('❌ '+e.message,'danger'); }
}

async function doDecrypt(){
  try{
    const pass = passEl.value.trim();
    if(!pass) return setStatus('⚠️ Enter passphrase','warn');
    let bundle; try{ bundle = JSON.parse(ctEl.value.trim()); }
    catch{ return setStatus('❌ Invalid ciphertext JSON','danger'); }
    setStatus('Decrypting…');
    const msg = await decJS(pass, bundle);
    ptEl.value = msg;
    setStatus('✅ Decrypted successfully','ok');
  }catch(e){ setStatus('❌ Wrong passphrase or corrupted data','danger'); }
}

encryptBtn.addEventListener('click', doEncrypt);
decryptBtn.addEventListener('click', doDecrypt);
encryptSticky.addEventListener('click', doEncrypt);
decryptSticky.addEventListener('click', doDecrypt);
$('#clearAll').addEventListener('click', ()=>{ ptEl.value=''; ctEl.value=''; passEl.value=''; setStatus('Cleared.'); });
$('#copyCt').addEventListener('click', async()=>{ if(ctEl.value) await navigator.clipboard.writeText(ctEl.value); });
$('#copyPt').addEventListener('click', async()=>{ if(ptEl.value) await navigator.clipboard.writeText(ptEl.value); });
