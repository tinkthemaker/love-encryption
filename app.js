import { encrypt as encJS, decrypt as decJS } from './lovecrypto-browser.js';

const $ = s => document.querySelector(s);
const passEl = $('#pass'), saltEl = $('#salt'), itersEl= $('#iters');
const ptEl = $('#pt'), ctEl = $('#ct');
const status = $('#status'), statusKdf = $('#statusKdf');
const strengthBar = $('#strength-bar');
const encryptBtn = $('#encryptBtn'), decryptBtn = $('#decryptBtn');
const encryptSticky = $('#encryptSticky'), decryptSticky = $('#decryptSticky');

const setStatus = (el, msg, type='muted') => { el.textContent = msg; el.className = 'status'; if (type !== 'muted') el.classList.add(type); };

async function doEncrypt(){
  encryptBtn.disabled = true; encryptBtn.classList.add('working');
  try{
    const pass = passEl.value.trim(); if(!pass) return setStatus(status,'⚠️ Enter a passphrase.','warn');
    const iters = Math.max(100000, Number(itersEl.value)||200000);
    const plaintext = ptEl.value; if(!plaintext) return setStatus(status,'⚠️ Type a message to encrypt.','warn');
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
    const pass = passEl.value.trim(); if(!pass) return setStatus(status,'⚠️ Enter the passphrase.','warn');
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

$('#togglePass').addEventListener('click', ()=>{ passEl.type = passEl.type==='password' ? 'text':'password'; });
$('#genPass').addEventListener('click', ()=>{
  const syll = ['la','no','ve','ri','ta','mo','na','li','ra','sa','mi','el','do','re','na','ka','shi','lo','zu','fi'];
  const words = Array.from({length:6},()=>Array.from({length:3},()=>syll[Math.random()*syll.length|0]).join(''));
  passEl.value = words.join('-'); passEl.dispatchEvent(new Event('input'));
  setStatus(statusKdf,'💡 Generated a random passphrase.','warn');
});

encryptBtn.addEventListener('click', doEncrypt); decryptBtn.addEventListener('click', doDecrypt);
encryptSticky.addEventListener('click', doEncrypt); decryptSticky.addEventListener('click', doDecrypt);

$('#clearAll').addEventListener('click', ()=>{ ptEl.value=''; ctEl.value=''; passEl.value=''; saltEl.value=''; setStatus(status,'Cleared all fields.'); passEl.dispatchEvent(new Event('input')); });

// Copy helpers
async function copyHandler(el, sourceEl, successMsg){
  if (!sourceEl.value) return; const textNode = Array.from(el.childNodes).find(n=>n.nodeType===Node.TEXT_NODE); if(!textNode) return; const orig=textNode.textContent;
  try{ await navigator.clipboard.writeText(sourceEl.value); setStatus(status, `✅ ${successMsg}`, 'ok'); textNode.textContent=' Copied!'; }
  catch{ setStatus(status, '❌ Clipboard blocked by browser.', 'danger'); textNode.textContent=' Copy Failed'; }
  finally{ setTimeout(()=>{ textNode.textContent = orig; }, 1500); }
}
$('#copyCt').addEventListener('click', (e)=>copyHandler(e.currentTarget, ctEl, 'Ciphertext copied.'));
$('#copyPt').addEventListener('click', (e)=>copyHandler(e.currentTarget, ptEl, 'Plaintext copied.'));

// Save/Open
$('#saveCt').addEventListener('click', ()=>{ if(!ctEl.value) return; const blob=new Blob([ctEl.value],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`love-message-${Date.now()}.love`; a.click(); URL.revokeObjectURL(a.href); setStatus(status,'💡 Save dialog initiated.','warn'); });
$('#openCt').addEventListener('click', ()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.love,application/json,.txt'; inp.onchange=async()=>{ const f=inp.files[0]; if(!f) return; ctEl.value=await f.text(); setStatus(status,'Loaded ciphertext from file.','ok'); }; inp.click(); });

// Strength meter (simple heuristic)
passEl.addEventListener('input', ()=>{ const p=passEl.value; let s=0; if(p.length>8)s++; if(p.length>12)s++; if(/[A-Z]/.test(p))s++; if(/[a-z]/.test(p))s++; if(/[0-9]/.test(p))s++; if(/[^A-Za-z0-9]/.test(p))s++; const bar=document.getElementById('strength-bar'); bar.className=''; const pct=(s/6)*100; if(pct>75) bar.classList.add('strong'); else if(pct>40) bar.classList.add('medium'); bar.style.width=pct+'%'; });

// Auto-decrypt when JSON pasted
ctEl.addEventListener('paste', ()=>{ setTimeout(()=>{ if(passEl.value.trim() && ctEl.value.trim().startsWith('{')){ try{ const j=JSON.parse(ctEl.value.trim()); if(j.v&&j.ct&&j.iv&&j.salt){ setStatus(status,'💡 Auto-decrypting pasted content…','warn'); doDecrypt(); } }catch(_){} } }, 1); });
```

---
## 4) `manifest.webmanifest`
```json
{
  "name": "Love Messages",
  "short_name": "Love ♥",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0e0f13",
  "theme_color": "#0e0f13",
  "icons": [
    { "src": "heart-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "heart-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}