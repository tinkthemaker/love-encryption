/* CIPHER — dither-bg.js
 * ditherdance-style background: a name-hashed palette rendered as an
 * ordered (Bayer 8x8) dither gradient — never blended, never blurred —
 * with a Browserbase-style dithered mountain silhouette up top.
 * Pointer-reactive: a light rises under the cursor with springy lag.
 * Zero dependencies. ~90 lines. Sits behind #ditherField (see style.css).
 */
(function () {
  'use strict';

  var NAME = 'cipher \u2665 b';              // the seed — change the name, change the sky
  var BAYER = [                              // 8x8 ordered matrix
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];
  var DOT = 3;                              // physical px per dither cell

  function hash(str) {                       // ditherdance-style name hash
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var seed = hash(NAME);

  // Palette: ramp from deep bg through rose to pale — deterministic
  function ramp(n) {
    var stops = [[10, 11, 15], [61, 18, 36], [122, 31, 67], [176, 58, 103], [255, 93, 143]];
    var t = n / 63 * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(t));
    var f = t - i;
    return [lerp(stops[i][0], stops[i + 1][0], f) | 0,
            lerp(stops[i][1], stops[i + 1][1], f) | 0,
            lerp(stops[i][2], stops[i + 1][2], f) | 0];
  }
  var PAL = [];
  for (var p = 0; p < 64; p++) PAL.push(ramp(p));
  PAL[63] = [255, 157, 186];                 // pale rose highlight

  var cv = document.getElementById('ditherField');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W, H, img;
  var mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t = seed % 100;                        // name decides where the sky starts

  function resize() {
    W = Math.ceil(innerWidth / DOT);
    H = Math.ceil(innerHeight / DOT);
    cv.width = W; cv.height = H;
    img = ctx.createImageData(W, H);
  }
  addEventListener('resize', resize);
  resize();

  addEventListener('pointermove', function (e) {
    mouse.tx = e.clientX / DOT;
    mouse.ty = e.clientY / DOT;
  });

  // Browserbase-style ridge line — deterministic from the seed
  function ridge(x, base, amp, freq, phase) {
    return base + Math.sin(x * freq + phase) * amp
              + Math.sin(x * freq * 2.7 + phase * 1.6) * amp * 0.4
              + Math.sin(x * freq * 6.1 + phase * 0.7) * amp * 0.15;
  }

  function frame() {
    if (!reduced) t += 0.012;
    mouse.x += (mouse.tx - mouse.x) * 0.07;   // springy lag
    mouse.y += (mouse.ty - mouse.y) * 0.07;
    var d = img.data;
    var H2 = H;
    for (var y = 0; y < H2; y++) {
      // mountain silhouette heights (in cells), back + front ridge
      var rowBack = H * 0.30;
      var back = ridge(0, 0, 0, 0, 0);
      for (var x = 0; x < W; x++) {
        var bY = ridge(x, H * 0.26, H * 0.07, 0.012, seed % 7);
        var fY = ridge(x, H * 0.32, H * 0.09, 0.021, (seed >> 3) % 11);
        var i = (y * W + x) * 4;

        // sky brightness: vertical ramp + drifting light + pointer light
        var dxp = x - mouse.x, dyp2 = y - mouse.y;
        var dp = Math.sqrt(dxp * dxp + dyp2 * dyp2);
        var gx = W * (0.28 + 0.2 * Math.sin(t * 0.4));
        var gy = H * 0.18;
        var dxg = x - gx, dyg = y - gy;
        var dg = Math.sqrt(dxg * dxg + dyg * dyg);
        var v = (1 - y / H2) * 26
              + 22 * Math.exp(-dg / 60)
              + 18 * Math.exp(-dp / 34)
              + 3 * Math.sin(t + x * 0.08 + y * 0.05);
        v = Math.max(0, Math.min(63, v));

        // mountains: darker ink over the sky
        var inBack = H2 - y > bY;   // unused var guard
        var sky = v;
        if (y > fY) {
          sky = 3;                            // front ridge: near-black ink
        } else if (y > bY) {
          sky = Math.max(0, v - 34);          // back ridge: dimmed
          if (sky < 6) sky = 6;
        }

        var b = Math.round(sky);
        var c = b >= BAYER[y & 7][x & 7] ? PAL[Math.max(8, b)] : null;
        if (c) {
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        } else {
          d[i + 3] = 0;                       // transparent: bg shows through
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    if (!reduced) requestAnimationFrame(frame);
    else setTimeout(frame, 120);
  }
  requestAnimationFrame(frame);
})();