/* CIPHER — dither-bg.js
 * "Ditherfield": a full-bleed scene drawn purely as Bayer 8x8 ordered dither.
 * Every cell is either an opaque palette colour or transparent (page ink shows
 * through) — no alpha blending, no blur. Scene, back to front:
 *   sky glow (dot density) -> sun / moon disc (+ stars in decrypt) ->
 *   4 fractal ridgelines (back = bright rim, front = ink) -> empty ink below.
 * Pulses (window.DitherField.pulse) add rings, scan bands, blooms and glitches
 * as extra "density" on top of the scene. Zero dependencies.
 */
(function () {
  'use strict';
  var noop = { pulse: function () {} };
  var cv = document.getElementById('ditherField');
  var ctx = null;
  try { ctx = cv && cv.getContext('2d'); } catch (e) { ctx = null; }
  if (!ctx) { window.DitherField = noop; return; }
  window.DitherField = noop;

  var root = document.documentElement;
  var BAYER = new Uint8Array([
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]);
  var LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  var CORAL = pack(255, 107, 90);
  var MODE_MS = 700;

  function pack(r, g, b) {
    return (LE ? (255 << 24 | b << 16 | g << 8 | r) : (r << 24 | g << 16 | b << 8 | 255)) >>> 0;
  }
  function easeOut(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; var q = 1 - p; return 1 - q * q * q * q; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---- palettes: ink -> deep -> mid -> accent -> highlight, 64 steps each ----
  var STOPS = [0, 0.25, 0.5, 0.78, 1];
  var HEX = {
    encrypt: ['07070a', '2a0d24', 'b02e6c', 'ff5d8f', 'ffb38a'],
    decrypt: ['07070a', '0b1433', '3b44d8', '7c8cff', '7fe7ff']
  };
  function buildPal(hex) {
    var out = new Float32Array(192), i, s, f;
    for (i = 0; i < 64; i++) {
      f = i / 63;
      for (s = 0; s < 3 && f > STOPS[s + 1]; s++) { /* find segment */ }
      var u = (f - STOPS[s]) / (STOPS[s + 1] - STOPS[s]);
      for (var c = 0; c < 3; c++) {
        var a = parseInt(hex[s].substr(c * 2, 2), 16), b = parseInt(hex[s + 1].substr(c * 2, 2), 16);
        out[i * 3 + c] = a + (b - a) * u;
      }
    }
    return out;
  }
  var PAL_A = buildPal(HEX.encrypt), PAL_B = buildPal(HEX.decrypt);
  var tab = new Uint32Array(64);
  function updateTab(m) {
    for (var i = 0; i < 64; i++) {
      var j = i * 3;
      tab[i] = pack((PAL_A[j] + (PAL_B[j] - PAL_A[j]) * m) | 0,
                    (PAL_A[j + 1] + (PAL_B[j + 1] - PAL_A[j + 1]) * m) | 0,
                    (PAL_A[j + 2] + (PAL_B[j + 2] - PAL_A[j + 2]) * m) | 0);
    }
  }

  // ---- seeded value noise for the ridgelines (deterministic) ----
  var seed = 0x9e3779b1, noiseTab = new Float32Array(256), n;
  for (n = 0; n < 256; n++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noiseTab[n] = seed / 4294967296;
  }
  function vnoise(u) {
    var i = Math.floor(u), f = u - i, a = noiseTab[i & 255], b = noiseTab[(i + 1) & 255];
    f = f * f * (3 - 2 * f);
    return a + (b - a) * f;
  }
  function fbm(u) {
    return (vnoise(u) * 0.5 + vnoise(u * 2.03 + 17.1) * 0.25 +
            vnoise(u * 4.1 + 3.7) * 0.125 + vnoise(u * 8.3 + 9.2) * 0.0625) / 0.9375;
  }

  // Ridge layers, back -> front. base/amp are fractions of height; peak/floor are
  // dot levels (0..63) at the rim and deep inside; fall = decay depth (fraction of H).
  // ab/aa: the same layer when anchored to the passphrase card (phones): mean
  // height above the card's top edge and amplitude, as fractions of the sky window.
  var LAYERS = [
    { base: 0.31, amp: 0.11, ab: 0.50, aa: 0.46, feat: 2.6, peak: 47, floor: 5, fall: 0.075, par: 4,  drift: 0.30 },
    { base: 0.385, amp: 0.07, ab: 0.34, aa: 0.30, feat: 3.8, peak: 38, floor: 3, fall: 0.06, par: 8,  drift: 0.55 },
    { base: 0.435, amp: 0.05, ab: 0.20, aa: 0.20, feat: 5.5, peak: 28, floor: 2, fall: 0.05, par: 12, drift: 0.85 },
    { base: 0.478, amp: 0.035, ab: 0.08, aa: 0.12, feat: 7.5, peak: 12, floor: 0, fall: 0.04, par: 18, drift: 1.20 }
  ];
  var LN = LAYERS.length, OFFS = [3.1, 41.7, 87.3, 129.9];

  // ---- state ----
  var W = 0, H = 0, cell = 3, img, buf;
  var tops = [], slope = [], dec = [];           // per layer, per column / per depth
  var gX, gY, pX, pY, rowAdd, rowGap, offs;      // per-column / per-row scratch
  // layout anchoring: geometry is blended between viewport fractions (wide
  // screens) and "the passphrase card is the ground" (phones)
  var G = { a: 0, g: 0, hb: 0, wh: 40, hz: 0, sunR: 0, sunCx: 0, sunCy: 0, moonR: 0, moonCx: 0, moonCy: 0,
            scanTop: 0, scanSpan: 0, starSpan: 0 };
  var baseRow = new Float32Array(4), ampRow = new Float32Array(4);
  var hdrA = [0, 0, 0, 0], hdrB = [0, 0, 0, 0];   // star-free boxes, document px (x0,y0,x1,y1)
  var scrollY = 0, yoi = 0, SCROLL_K = 0.6, scrollTimer = 0;
  var starX, starY, starP, starS, NSTARS = 0;
  var mix = 0, mixFrom = 0, mixTo = 0, mixT0 = 0, fading = false;
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, target: 0, seen: false }, par = 0;
  var busyAmt = 0, busyUntil = 0, sx = 0, sy = 0, shimT = 0;
  var errT0 = -1e9, errReroll = 0;
  var lastKey = -1e9;
  var MAXW = 12;
  var wcx = new Float32Array(MAXW), wcy = new Float32Array(MAXW), wt0 = new Float64Array(MAXW),
      wlife = new Float32Array(MAXW), wmax = new Float32Array(MAXW), ww = new Float32Array(MAXW),
      wamp = new Float32Array(MAXW), wglow = new Float32Array(MAXW), wkey = new Uint8Array(MAXW),
      walive = new Uint8Array(MAXW);
  var aCx = new Float32Array(MAXW), aCy = new Float32Array(MAXW), aIn = new Float32Array(MAXW),
      aOut = new Float32Array(MAXW), aR = new Float32Array(MAXW), aW = new Float32Array(MAXW),
      aAmp = new Float32Array(MAXW), nw = 0, gAdd = 0;
  var reduced = false, raf = 0, last = 0, cost = 0, slow = false, skipOdd = 0;

  function readMode() { return root.dataset && root.dataset.mode === 'decrypt' ? 1 : 0; }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function docTop(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }
  function docLeft(el) { var x = 0; while (el) { x += el.offsetLeft; el = el.offsetParent; } return x; }
  function boxOf(els, pad, out) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, el;
    for (i = 0; i < els.length; i++) {
      el = els[i]; if (!el) continue;
      var l = docLeft(el), t = docTop(el);
      x0 = Math.min(x0, l); y0 = Math.min(y0, t); x1 = Math.max(x1, l + el.offsetWidth); y1 = Math.max(y1, t + el.offsetHeight);
    }
    if (x0 > x1) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    out[0] = x0 - pad; out[1] = y0 - pad; out[2] = x1 + pad; out[3] = y1 + pad;
  }

  // Read the page layout (document coords, transform-free via offsetTop) and
  // derive every scene constant. Cheap; called on resize, load, font and layout
  // changes, never per frame.
  function layout() {
    var vw = window.innerWidth || 360, i, k, d;
    var card = document.querySelector('.settings'), hd = document.querySelector('header');
    var a = clamp((900 - vw) / 340, 0, 1);
    var g = card ? docTop(card) / cell : H * 0.5;
    var hb = hd ? (docTop(hd) + hd.offsetHeight) / cell : g * 0.4;
    G.a = a; G.g = g; G.hb = hb;
    var wh = clamp(g - hb, 22, Math.max(22, g * 0.85)); G.wh = wh;
    var vs = cell === 4 ? 0.92 : 1;
    for (k = 0; k < LN; k++) {
      var L = LAYERS[k], fall = lerp(L.fall * H, L.fall * wh * 3, a);
      baseRow[k] = lerp(H * L.base * vs, g - wh * L.ab, a);
      ampRow[k] = lerp(H * L.amp, wh * L.aa, a);
      for (d = 0; d < dec[k].length; d++) dec[k][d] = L.floor + (L.peak - L.floor) * Math.exp(-d / fall);
    }
    G.hz = lerp(H * 0.46, baseRow[0] + wh * 0.18, a);
    var rD = Math.min(W * 0.26, H * 0.12), rA = clamp(Math.min(W * 0.22, wh * 0.52), 12, 40);
    G.sunR = lerp(rD, rA, a);
    G.sunCx = lerp(W * (cell === 4 ? 0.64 : 0.5), W * 0.5, a);
    G.sunCy = lerp(H * 0.25, g - wh * 0.62, a);
    G.moonR = G.sunR * 0.5;
    G.moonCx = lerp(W * 0.74, W * 0.7, a);
    G.moonCy = lerp(H * 0.17, hb + wh * 0.34, a);
    G.scanTop = lerp(H * 0.18, g - wh * 0.95, a);
    G.scanSpan = lerp(H * 0.32, wh * 1.1, a);
    G.starSpan = lerp(H * 0.4, Math.max(10, g - wh * 0.45), a);
    // star-free zones: the logo + wordmark cluster and the version pill
    var lg = document.querySelector('.logo-icon'), h1 = document.querySelector('header h1'), vr = document.getElementById('appVersion');
    boxOf([lg, h1], 14, hdrA); boxOf([vr], 12, hdrB);
    // stars: deterministic scatter over the whole sky above the back range
    NSTARS = Math.round(W * G.starSpan * lerp(0.0075, 0.012, a));
    starX = new Int16Array(NSTARS); starY = new Int16Array(NSTARS);
    starP = new Float32Array(NSTARS); starS = new Float32Array(NSTARS);
    var s = 12345;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    for (i = 0; i < NSTARS; i++) {
      starX[i] = (rnd() * W) | 0; starY[i] = (Math.pow(rnd(), 1.1) * G.starSpan) | 0;
      starP[i] = rnd() * 6.283; starS[i] = 0.8 + rnd() * 2.2;
    }
  }

  function relayout() { if (!W) return; layout(); if (reduced) renderStatic(); }

  function resize() {
    var vw = window.innerWidth || 360, vh = window.innerHeight || 640;
    cell = vw >= 1024 ? 4 : 3;
    W = Math.max(8, Math.ceil(vw / cell)); H = Math.max(8, Math.ceil(vh / cell));
    cv.width = W; cv.height = H;
    img = ctx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
    var k;
    for (k = 0; k < LN; k++) {
      tops[k] = new Float32Array(W); slope[k] = new Float32Array(W);
      dec[k] = new Float32Array(2 * H + 6);     // tops may sit above the viewport (scroll)
    }
    gX = new Float32Array(W); pX = new Float32Array(W); offs = new Int16Array(H);
    gY = new Float32Array(H); pY = new Float32Array(H);
    rowAdd = new Float32Array(H); rowGap = new Uint8Array(H);
    scrollY = Math.max(0, window.pageYOffset || 0);
    layout();
    if (ptr.seen) { ptr.tx = clamp(ptr.tx, 0, W); ptr.ty = clamp(ptr.ty, 0, H); }
    if (reduced) renderStatic();
  }

  // ---- per-frame state updates (time, pointer, pulses) ----
  function step(now, dt) {
    var i, p;
    if (fading) {
      p = (now - mixT0) / MODE_MS;
      if (p >= 1) { mix = mixTo; fading = false; } else mix = mixFrom + (mixTo - mixFrom) * easeOut(p);
      updateTab(mix);
    }
    var kp = 1 - Math.exp(-dt * 5);
    ptr.x += (ptr.tx - ptr.x) * kp; ptr.y += (ptr.ty - ptr.y) * kp;
    ptr.amp += (ptr.target - ptr.amp) * (1 - Math.exp(-dt * (ptr.target ? 6 : 1.6)));
    par += ((ptr.seen ? ptr.tx / W - 0.5 : 0) - par) * (1 - Math.exp(-dt * 2.5));
    var wantBusy = root.hasAttribute('data-busy') || now < busyUntil;
    busyAmt += ((wantBusy ? 1 : 0) - busyAmt) * (1 - Math.exp(-dt * 6));
    if (busyAmt < 0.01) busyAmt = 0;
    if (busyAmt > 0.3 && now > shimT) { shimT = now + 70; sx = (Math.random() * 8) | 0; sy = (Math.random() * 8) | 0; }
    else if (busyAmt <= 0.3) { sx = 0; sy = 0; }
    nw = 0; gAdd = 0;
    for (i = 0; i < MAXW; i++) {
      if (!walive[i]) continue;
      p = (now - wt0[i]) / wlife[i];
      if (p >= 1) { walive[i] = 0; continue; }
      var r = easeOut(p) * wmax[i], w = ww[i], inn = Math.max(0, r - w), out = r + w, f = 1 - p;
      aCx[nw] = wcx[i]; aCy[nw] = wcy[i]; aIn[nw] = inn * inn; aOut[nw] = out * out;
      aR[nw] = r; aW[nw] = w; aAmp[nw] = wamp[i] * f; nw++;
      gAdd += wglow[i] * f * f;
    }
    // glitch row-band offsets (error pulse), re-rolled every ~50 ms
    var ea = 1 - (now - errT0) / 250;
    if (ea > 0) {
      if (now > errReroll) {
        errReroll = now + 50; offs.fill(0);
        for (i = 0; i < 5; i++) {
          var y0 = (Math.random() * H) | 0, hh = 2 + ((Math.random() * 9) | 0),
              o = (2 + Math.random() * 10) * (Math.random() < 0.5 ? -1 : 1) | 0;
          for (var y = y0; y < y0 + hh && y < H; y++) offs[y] = o;
        }
      }
    } else if (errReroll) { errReroll = 0; offs.fill(0); }
  }

  function addWave(x, y, now, life, maxR, width, amp, glow, key) {
    var slot = -1, oldest = -1, oldT = 1e18, keys = 0, i;
    for (i = 0; i < MAXW; i++) {
      if (!walive[i]) { if (slot < 0) slot = i; continue; }
      if (wkey[i]) keys++;
      if (wt0[i] < oldT) { oldT = wt0[i]; oldest = i; }
    }
    if (key && keys >= 8) return;
    if (slot < 0) slot = oldest;
    wcx[slot] = x; wcy[slot] = y; wt0[slot] = now; wlife[slot] = life; wmax[slot] = maxR;
    ww[slot] = width; wamp[slot] = amp; wglow[slot] = glow; wkey[slot] = key ? 1 : 0; walive[slot] = 1;
  }

  // ---- draw one frame into the ImageData ----
  function draw(t, now) {
    var x, y, k, i;
    var par2 = par;
    yoi = Math.round(-scrollY * SCROLL_K / cell);       // terrain follows scroll at ~0.6x
    var hy = yoi;
    // ridge columns (depend only on x): top edge + lit-side slope per layer
    for (k = 0; k < LN; k++) {
      var L = LAYERS[k], T = tops[k], S = slope[k], F = L.feat * Math.max(1, Math.sqrt(W / 130));
      var shift = -par2 * L.par + t * L.drift;
      for (x = 0; x < W; x++) {
        var nz = fbm((x + shift) / W * F + OFFS[k]);
        if (k === 0) nz = nz * 0.6 + (1 - Math.abs(2 * nz - 1)) * 0.4;   // craggier back range
        T[x] = clamp(baseRow[k] - ampRow[k] * (nz - 0.5) * 2.6 + hy, -H, 2 * H);
      }
      for (x = 0; x < W; x++) {
        S[x] = clamp((T[Math.min(W - 1, x + 1)] - T[Math.max(0, x - 1)]) * 0.14, -0.4, 0.4);
      }
    }
    // sun <-> moon: position, radius, glow, stripes and crescent bite follow `mix`
    var e = mix;
    var cx = G.sunCx * (1 - e) + G.moonCx * e;
    var cy = (G.sunCy + Math.sin(t * 0.3)) * (1 - e) + G.moonCy * e + hy;
    var r = G.sunR * (1 - e) + G.moonR * e, r2 = r * r;
    var bx = r * 0.36, by = -r * 0.14, br2 = r * r * 0.56;
    var sig = r * 1.15, glowA = (24 - 10 * e) * (1 + 0.04 * Math.sin(t * 0.9));
    for (x = 0; x < W; x++) gX[x] = Math.exp(-(x - cx) * (x - cx) / (2 * sig * sig));
    for (y = 0; y < H; y++) {
      gY[y] = Math.exp(-(y - cy) * (y - cy) / (2 * sig * sig));
      var dy = y - cy, gp = 0;
      if (e < 0.5 && dy > r * 0.05 && dy < r) { gp = (dy % 7) / 7 < (dy / r) * 0.62 ? 1 : 0; }
      rowGap[y] = gp;
    }
    var usePtr = ptr.amp > 0.01, ps = 52 / cell, pa = ptr.amp * 17;
    if (usePtr) {
      for (x = 0; x < W; x++) pX[x] = Math.exp(-(x - ptr.x) * (x - ptr.x) / (2 * ps * ps));
      for (y = 0; y < H; y++) pY[y] = Math.exp(-(y - ptr.y) * (y - ptr.y) / (2 * ps * ps));
    }
    // busy scan band sweeping down the terrain + global bloom glow
    var scanC = G.scanTop + G.scanSpan * ((t * 0.7) % 1) + hy, hz = G.hz;
    for (y = 0; y < H; y++) {
      rowAdd[y] = gAdd + (busyAmt > 0 ? 20 * busyAmt * Math.exp(-(y - scanC) * (y - scanC) / 30) : 0);
    }
    var errA = clamp(1 - (performance.now() - errT0) / 250, 0, 1);
    var errThr = errA > 0 ? 64 - 30 * errA : 99;
    var t0 = tops[0], t1 = tops[1], t2 = tops[2], t3 = tops[3];
    var s0 = slope[0], s1 = slope[1], s2 = slope[2], s3 = slope[3];
    var d0 = dec[0], d1 = dec[1], d2a = dec[2], d3 = dec[3];

    for (y = 0; y < H; y++) {
      var rowB = ((y + sy) & 7) << 3, o = offs[y], ra = rowAdd[y], gy = gY[y], dyd = y - cy,
          rowDisc = dyd * dyd < r2, base = y * W, py = usePtr ? pY[y] * pa : 0, sk = 36 * Math.pow(clamp((y - hy) / hz, 0, 1), 2.4);
      for (x = 0; x < W; x++) {
        var xi = x + o; if (xi < 0) xi += W; else if (xi >= W) xi -= W;
        var lvl, tp;
        if (y >= (tp = t3[xi])) lvl = d3[(y - tp) | 0] * (1 + s3[xi]);
        else if (y >= (tp = t2[xi])) lvl = d2a[(y - tp) | 0] * (1 + s2[xi]);
        else if (y >= (tp = t1[xi])) lvl = d1[(y - tp) | 0] * (1 + s1[xi]);
        else if (y >= (tp = t0[xi])) lvl = d0[(y - tp) | 0] * (1 + s0[xi]);
        else {
          lvl = sk + glowA * gX[xi] * gy;
          if (rowDisc) {
            var dx = xi - cx, dd = dx * dx + dyd * dyd;
            if (dd < r2) {
              var cut = rowGap[y] ? 1 - e : 1;
              if (e > 0.01) { var ex = dx - bx, ey = dyd - by; if (ex * ex + ey * ey < br2) cut = 0; }
              lvl += (52 + 11 * (1 - dd / r2) - lvl) * cut;
            }
          }
        }
        lvl += ra + py * (usePtr ? pX[x] : 0);
        for (i = 0; i < nw; i++) {
          var wx = xi - aCx[i], wy = y - aCy[i], wd = wx * wx + wy * wy;
          if (wd > aIn[i] && wd < aOut[i]) lvl += aAmp[i] * (1 - Math.abs(Math.sqrt(wd) - aR[i]) / aW[i]);
        }
        var li = lvl > 63 ? 63 : lvl | 0;
        buf[base + x] = li > 0 && li > BAYER[rowB + ((x + sx) & 7)] ? (li >= errThr ? CORAL : tab[li]) : 0;
      }
    }
    // twinkling single-cell stars (decrypt mood), only above the back ridge and
    // never over the logo / wordmark / version pill
    if (mix > 0.02) {
      var sc = scrollY, ax0 = hdrA[0] / cell, ay0 = (hdrA[1] - sc) / cell, ax1 = hdrA[2] / cell, ay1 = (hdrA[3] - sc) / cell,
          bx0 = hdrB[0] / cell, by0 = (hdrB[1] - sc) / cell, bx1 = hdrB[2] / cell, by1 = (hdrB[3] - sc) / cell;
      for (i = 0; i < NSTARS; i++) {
        var stx = starX[i], sty = starY[i] + hy;
        if (sty < 0 || sty >= H || sty >= t0[stx] - 2) continue;
        if (stx > ax0 && stx < ax1 && sty > ay0 && sty < ay1) continue;
        if (stx > bx0 && stx < bx1 && sty > by0 && sty < by1) continue;
        var ddx = stx - cx, ddy = sty - cy;
        if (ddx * ddx + ddy * ddy < r2 * 1.1) continue;
        var v = (0.5 + 0.5 * Math.sin(t * starS[i] + starP[i])) * mix;
        if (v > 0.45) buf[sty * W + stx] = tab[v > 0.8 ? 63 : 46];
      }
    }
  }

  function present() { ctx.putImageData(img, 0, 0); }

  function renderStatic() {
    busyAmt = 0; nw = 0; gAdd = 0; ptr.amp = 0; par = 0; sx = 0; sy = 0;
    offs.fill(0); errT0 = -1e9;
    mix = mixTo = readMode(); fading = false; updateTab(mix);
    draw(2.0, 0); present();
  }

  // ---- loop ----
  function tick(ts) {
    raf = 0;
    if (document.hidden || reduced) return;
    raf = requestAnimationFrame(tick);
    if (slow && (skipOdd ^= 1)) return;          // low-end guard: ~30 fps
    var now = ts || performance.now();
    var dt = clamp((now - last) / 1000, 0.001, 0.1);
    last = now;
    var c0 = performance.now();
    step(now, dt); draw(now / 1000, now); present();
    cost += (performance.now() - c0 - cost) * 0.1;
    if (!slow && cost > 20) slow = true; else if (slow && cost < 11) slow = false;
  }
  function start() {
    if (raf || reduced || document.hidden) return;
    last = performance.now(); raf = requestAnimationFrame(tick);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function setMode(target, instant) {
    if (target === mixTo && !fading) return;
    if (instant || reduced) { mix = mixTo = target; fading = false; updateTab(mix); if (reduced) renderStatic(); return; }
    mixFrom = mix; mixTo = target; mixT0 = performance.now(); fading = true;
  }

  window.DitherField = {
    pulse: function (kind, x, y) {
      try {
        var now = performance.now();
        if (kind === 'mode') { setMode(readMode(), false); }
        if (reduced || !W) return;
        var cxp = (typeof x === 'number' ? x : window.innerWidth / 2) / cell,
            cyp = (typeof y === 'number' ? y : window.innerHeight * 0.35) / cell, big = Math.sqrt(W * W + H * H);
        if (kind === 'key') {
          if (now - lastKey < 90) return;
          lastKey = now; addWave(cxp, cyp, now, 900, 24, 2.5, 15, 0, true);
        } else if (kind === 'busy') { busyUntil = now + 300; }
        else if (kind === 'done') { addWave(cxp, cyp, now, 1300, big, 9, 26, 12, false); }
        else if (kind === 'error') { errT0 = now; errReroll = 0; }
        else if (kind === 'mode') { addWave(cxp, cyp, now, 1000, big * 0.7, 12, 11, 0, false); }
      } catch (e) { /* cosmetic only */ }
    }
  };

  // ---- wiring ----
  function onPointer(e) {
    if (!W) return;
    ptr.tx = clamp(e.clientX / cell, 0, W); ptr.ty = clamp(e.clientY / cell, 0, H);
    if (!ptr.seen) { ptr.seen = true; ptr.x = ptr.tx; ptr.y = ptr.ty; }
    ptr.target = 1;
  }
  function onPointerEnd(e) { if (e.pointerType === 'touch') ptr.target = 0; }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('pointerup', onPointerEnd, { passive: true });
  window.addEventListener('pointercancel', onPointerEnd, { passive: true });

  function onScroll() {
    scrollY = Math.max(0, window.pageYOffset || 0);
    if (reduced) { clearTimeout(scrollTimer); scrollTimer = setTimeout(renderStatic, 140); }  // re-render on scroll end
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var lt = 0;
  function onLayoutChange() { if (lt) return; lt = requestAnimationFrame(function () { lt = 0; relayout(); }); }
  window.addEventListener('load', onLayoutChange);
  document.addEventListener('animationend', onLayoutChange, true);
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(onLayoutChange); } catch (e) { /* cosmetic */ }
  try { var mainEl = document.querySelector('main'); if (mainEl && window.ResizeObserver) new ResizeObserver(onLayoutChange).observe(mainEl); } catch (e) { /* cosmetic */ }

  var rt = 0;
  function onResize(delay) { clearTimeout(rt); rt = setTimeout(resize, delay); }
  window.addEventListener('resize', function () { onResize(100); });
  window.addEventListener('orientationchange', function () { onResize(250); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

  try {
    new MutationObserver(function () { setMode(readMode(), false); })
      .observe(root, { attributes: true, attributeFilter: ['data-mode'] });
  } catch (e) { /* pulse('mode') still works */ }

  var mq = null;
  try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { mq = null; }
  function applyMotion() {
    reduced = !!(mq && mq.matches);
    if (reduced) { stop(); renderStatic(); } else { updateTab(mix); start(); }
  }
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', applyMotion); else if (mq.addListener) mq.addListener(applyMotion); }

  mix = mixTo = readMode(); updateTab(mix);
  resize();
  applyMotion();
  onLayoutChange();
})();
