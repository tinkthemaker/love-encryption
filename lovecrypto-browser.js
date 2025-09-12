<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Love Messages ♥ – Local Web Encryptor</title>
  <style>
    /* (CSS from the optimized dark-mode mobile version remains unchanged) */
  </style>
</head>
<body>
  <!-- (same header, main sections, sticky bar, etc. as before) -->

  <script type="module">
  import { encrypt as encJS, decrypt as decJS } from './lovecrypto-browser.js';

  // -------- DOM helpers --------
  const $ = sel => document.querySelector(sel);
  const passEl = $('#pass');
  const saltEl = $('#salt');
  const itersEl= $('#iters');
  const ptEl   = $('#pt');
  const ctEl   = $('#ct');
  const status = $('#status');
  const statusKdf = $('#statusKdf');

  const setStatus = (el, msg)=> el.textContent = msg;

  // UI: passphrase tools
  $('#togglePass').addEventListener('click', ()=>{ passEl.type = passEl.type==='password' ? 'text' : 'password'; });
  $('#genPass').addEventListener('click', ()=>{
    const syll = ['la','no','ve','ri','ta','mo','na','li','ra','sa','mi','el','do','re','na','ka','shi','lo','zu','fi'];
    let words=[]; for(let i=0;i<6;i++){ let w=''; for(let j=0;j<3;j++){ w+= syll[Math.floor(Math.random()*syll.length)]; } words.push(w); }
    passEl.value = words.join('-');
    setStatus(statusKdf, 'Generated a random passphrase (consider Diceware).');
  });

  // Encrypt using module
  async function doEncrypt(){
    try{
      const pass = passEl.value.trim(); if(!pass){ alert('Enter a passphrase.'); return; }
      const iters = Math.max(100000, Number(itersEl.value)||200000);
      const plaintext = ptEl.value; if(!plaintext){ alert('Type a message to encrypt.'); return; }
      setStatus(status, 'Encrypting…');
      const bundle = await encJS(pass, plaintext, iters);
      ctEl.value = JSON.stringify(bundle);
      saltEl.value = bundle.salt;
      setStatus(status, 'Done. Ciphertext ready.');
      ctEl.scrollIntoView({behavior:'smooth', block:'center'});
    }catch(err){ console.error(err); setStatus(status, 'Encrypt error: ' + err.message); }
  }

  // Decrypt using module
  async function doDecrypt(){
    try{
      const pass = passEl.value.trim(); if(!pass){ alert('Enter a passphrase.'); return; }
      const raw = ctEl.value.trim(); if(!raw){ alert('Paste a ciphertext JSON.'); return; }
      let bundle; try{ bundle = JSON.parse(raw); }catch{ alert('Ciphertext must be JSON produced by this page.'); return; }
      setStatus(status, 'Decrypting…');
      const msg = await decJS(pass, bundle);
      ptEl.value = msg;
      saltEl.value = bundle.salt||'';
      itersEl.value = Number(bundle.iters||itersEl.value||200000);
      setStatus(status, 'Decrypted successfully.');
      ptEl.scrollIntoView({behavior:'smooth', block:'center'});
    }catch(err){ console.error(err); setStatus(status, 'Decrypt error (wrong passphrase or corrupted data).'); }
  }

  // Main buttons
  $('#encryptBtn').addEventListener('click', doEncrypt);
  $('#decryptBtn').addEventListener('click', doDecrypt);

  // Sticky bar buttons (mobile)
  $('#encryptSticky').addEventListener('click', doEncrypt);
  $('#decryptSticky').addEventListener('click', doDecrypt);
  $('#clearSticky').addEventListener('click', ()=>{ ptEl.value=''; ctEl.value=''; setStatus(status,'Cleared.'); });

  // Clipboard helpers
  $('#copyCt').addEventListener('click', async()=>{
    try{ await navigator.clipboard.writeText(ctEl.value); setStatus(status,'Ciphertext copied.'); }catch{ setStatus(status,'Clipboard blocked by browser.'); }
  });
  $('#copyPt').addEventListener('click', async()=>{
    try{ await navigator.clipboard.writeText(ptEl.value); setStatus(status,'Plaintext copied.'); }catch{ setStatus(status,'Clipboard blocked by browser.'); }
  });

  // File save/open
  $('#saveCt').addEventListener('click', ()=>{
    const blob = new Blob([ctEl.value||''], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'love-message.love';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#openCt').addEventListener('click', ()=>{
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.love,application/json';
    inp.onchange = async () => {
      const file = inp.files[0]; if(!file) return;
      const txt = await file.text();
      ctEl.value = txt; setStatus(status,'Loaded ciphertext from file.');
    };
    inp.click();
  });

  // Auto-grow textareas on mobile
  function autoGrow(el){ el.style.height='auto'; el.style.height=Math.min(600, el.scrollHeight)+'px'; }
  [ptEl, ctEl].forEach(el=>{ el.addEventListener('input', ()=>autoGrow(el)); autoGrow(el); });
</script>
</body>
</html>
