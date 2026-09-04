'use strict';
// A DRAFT scene, generated so there is something real in the pipeline to look at.
// Throwaway: replace art/layers/ with hand-drawn work and delete this file.
//
//   node tools/draft-scene.js && node tools/import-layers.js && node tools/gen-kotlin.js
const fs = require('fs');
const path = require('path');
const { encodePNGA } = require('./png.js');

const W = 160, H = 288;
const OUT = path.join(__dirname, '../art/layers');

// Atmospheric perspective does the heavy lifting: each band sits closer to the sky's value the
// further away it is, so depth reads from value alone rather than from detail.
const C = {
  skyTop: '#A4C4B6', skyMid: '#BCD5C6', skyLow: '#D9E7D7',
  cloud: '#E6F0E4', cloudShade: '#CADCD0',
  ridge3: '#A8C2B4', ridge2: '#94B2A3', ridge1: '#7FA294',
  mid: '#6A9384', midDark: '#5A8377',
  near: '#446B5E', nearDark: '#34564C',
  frame: '#1D322E', frameDark: '#142523',
  bark: '#22322F', barkLit: '#2E403A', barkDark: '#162422',
  water: '#A9C8BE', waterLit: '#DBEAE1', waterDeep: '#6C978B',
  bank: '#40604F', bankDark: '#2E4839',
  leafA: '#B7C063', leafB: '#96A64C', leafC: '#788A40',
  coralA: '#CB8672', coralB: '#DC9C86', coralC: '#A66653',
  rock: '#6E626C', rockLit: '#8B7C7C',
  groundFar: '#5E8874', groundNear: '#3C5C4D', groundLit: '#6B9480',
  bird: '#3A4A46',
};

function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buffer() { return new Uint8Array(W * H * 4); }
function set(b, x, y, hex) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const c = rgb(hex), i = (y * W + x) * 4;
  b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = 255;
}
function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const h = v => v.toString(16).padStart(2, '0');
  return '#' + h(Math.round(A[0] + (B[0] - A[0]) * t)) + h(Math.round(A[1] + (B[1] - A[1]) * t)) +
    h(Math.round(A[2] + (B[2] - A[2]) * t));
}

/** A conifer: stacked branch tiers that reset narrow and flare out, giving the notched profile. */
function conifer(b, x, baseY, h, w, colour, rnd, trunkColour) {
  const tiers = Math.max(4, Math.round(h / 8));
  const canopyH = h * 0.92;
  const top = baseY - h;
  for (let i = 0; i < tiers; i++) {
    const y0 = top + canopyH * (i / tiers);
    const y1 = top + canopyH * ((i + 1) / tiers);
    const maxHW = (w / 2) * Math.pow((i + 1) / tiers, 0.78);
    const minHW = maxHW * 0.32;
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      const lt = (y - y0) / Math.max(1, y1 - y0);
      let hw = minHW + (maxHW - minHW) * Math.pow(lt, 0.7);
      hw += (rnd() - 0.5) * Math.max(0.7, w * 0.07);
      const hwi = Math.round(Math.max(0.5, hw));
      for (let dx = -hwi; dx <= hwi; dx++) set(b, x + dx, y, colour);
    }
  }
  if (trunkColour && h > 26) {
    const tw = Math.max(1, Math.round(w * 0.09));
    for (let y = Math.round(baseY - h * 0.10); y < baseY; y++) {
      for (let i = 0; i < tw; i++) set(b, x - (tw >> 1) + i, y, trunkColour);
    }
  }
}

/** A rounded foliage clump, for the broadleaf shapes and the shrub banks. */
function blob(b, cx, cy, rx, ry, colour, rnd, ragged) {
  for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
    const t = (y - cy) / ry;
    let hw = rx * Math.sqrt(Math.max(0, 1 - t * t));
    if (ragged) hw += (rnd() - 0.5) * rx * 0.28;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      if (ragged && rnd() > 0.93) continue;
      set(b, x, y, colour);
    }
  }
}

// ---------------------------------------------------------------- 01 sky
function sky() {
  const b = buffer();
  const rnd = rng(11);
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / 168);
    const c = t < 0.5 ? mixHex(C.skyTop, C.skyMid, t * 2) : mixHex(C.skyMid, C.skyLow, (t - 0.5) * 2);
    for (let x = 0; x < W; x++) set(b, x, y, c);
  }
  // Soft cumulus, lighter on top, sitting well above the treeline.
  const clouds = [[44, 58, 26, 11], [104, 46, 30, 12], [78, 84, 34, 10], [22, 96, 20, 7], [132, 92, 22, 8]];
  for (const [cx, cy, rx, ry] of clouds) {
    for (let i = 0; i < 4; i++) {
      const ox = (i - 1.5) * rx * 0.5, oy = (rnd() - 0.5) * ry * 0.5;
      blob(b, cx + ox, cy + oy, rx * (0.5 + rnd() * 0.35), ry * (0.7 + rnd() * 0.4), C.cloudShade, rnd, false);
    }
    for (let i = 0; i < 4; i++) {
      const ox = (i - 1.5) * rx * 0.5, oy = (rnd() - 0.5) * ry * 0.4 - ry * 0.25;
      blob(b, cx + ox, cy + oy, rx * (0.45 + rnd() * 0.3), ry * (0.55 + rnd() * 0.3), C.cloud, rnd, false);
    }
  }
  // Birds, small enough to read as marks rather than shapes.
  for (const [x, y] of [[62, 40], [72, 36], [82, 43], [95, 33]]) {
    set(b, x, y, C.bird); set(b, x - 1, y - 1, C.bird); set(b, x + 1, y - 1, C.bird);
    set(b, x - 2, y - 1, C.bird); set(b, x + 2, y - 1, C.bird);
  }
  return b;
}

// ------------------------------------------------------- 02 far ridge
function farRidge() {
  const b = buffer();
  const rnd = rng(23);
  for (let pass = 0; pass < 2; pass++) {
    const colour = pass === 0 ? C.ridge3 : C.ridge2;
    const baseY = 156 - pass * 2;
    for (let x = -6; x < W + 6; x += 4 + Math.round(rnd() * 3)) {
      const h = 16 + rnd() * (pass === 0 ? 20 : 30);
      conifer(b, x + rnd() * 3, baseY, h, h * 0.42, colour, rnd, null);
    }
  }
  return b;
}

// ------------------------------------------------------ 03 mid forest
function midForest() {
  const b = buffer();
  const rnd = rng(37);
  for (let x = -8; x < W + 8; x += 7 + Math.round(rnd() * 5)) {
    // Keep the valley floor clear so the river has somewhere to run.
    const d = Math.abs(x - 80);
    if (d < 16 && rnd() > 0.25) continue;
    const h = 34 + rnd() * 42 + d * 0.16;
    const colour = rnd() > 0.55 ? C.ridge1 : C.mid;
    conifer(b, x + rnd() * 4, 170 + rnd() * 4, h, h * 0.44, colour, rnd, null);
  }
  // A few broadleaf crowns break up the run of spires.
  for (const [x, y, r] of [[34, 150, 9], [126, 146, 8], [56, 156, 6], [108, 158, 7]]) {
    blob(b, x, y, r, r * 0.7, C.midDark, rnd, true);
    for (let i = 0; i < 14; i++) {
      set(b, x + (rnd() - 0.5) * r * 1.8, y - r * 0.4 + (rnd() - 0.5) * r * 0.8, C.coralC);
    }
  }
  return b;
}

// ----------------------------------------------------- 04 near forest
function nearForest() {
  const b = buffer();
  const rnd = rng(53);
  for (let x = -10; x < W + 10; x += 9 + Math.round(rnd() * 6)) {
    const d = Math.abs(x - 80);
    if (d < 30 && rnd() > 0.12) continue;      // the river corridor stays open
    const h = 62 + rnd() * 58;
    conifer(b, x + rnd() * 5, 196 + rnd() * 8, h, h * 0.40,
      rnd() > 0.5 ? C.near : C.nearDark, rnd, C.barkDark);
  }
  // Coral-crowned broadleaves, the warm counterpoint to all the green.
  for (const [x, y, r] of [[32, 138, 12], [136, 130, 11], [20, 166, 9], [118, 168, 8]]) {
    // Trunk first and kept short, so the crown sits in the canopy instead of on a stick.
    const tw = Math.max(2, Math.round(r * 0.28));
    // Short enough that the crown covers most of it - a long stick reads as a lollipop.
    for (let yy = y; yy < y + r * 1.35; yy++) {
      for (let i = 0; i < tw; i++) set(b, x - (tw >> 1) + i, yy, i === 0 ? C.barkDark : C.bark);
    }
    blob(b, x, y, r, r * 0.8, C.coralC, rnd, true);
    blob(b, x - r * 0.15, y - r * 0.2, r * 0.8, r * 0.58, C.coralA, rnd, true);
    blob(b, x - r * 0.3, y - r * 0.38, r * 0.5, r * 0.32, C.coralB, rnd, true);
  }
  return b;
}

// --------------------------------------------------------- 04 ground
/** The valley floor. Its own layer because the near forest stands on it, not behind it. */
function ground() {
  const b = buffer();
  const rnd = rng(59);
  for (let y = 158; y < H; y++) {
    const t = (y - 158) / (H - 158);
    const base = mixHex(C.groundFar, C.groundNear, Math.pow(t, 0.75));
    for (let x = 0; x < W; x++) {
      const n = rnd();
      set(b, x, y, n > 0.955 ? C.groundLit : n < 0.04 ? C.bankDark : base);
    }
  }
  return b;
}

// ---------------------------------------------------------- 05 river
function river() {
  const b = buffer();
  const rnd = rng(71);
  const vy = 150;
  // Cached per row so the banks, the water and the ripples all agree on where the river is.
  const cx = [], hw = [];
  for (let y = 0; y < H; y++) {
    const t = Math.max(0, (y - vy) / (H - vy));
    // Two offset waves make the bend read as a meander rather than a single arc.
    cx[y] = 80 + (Math.sin(t * 2.6 + 0.35) * 26 + Math.sin(t * 5.9) * 7) * Math.pow(t, 0.55);
    hw[y] = 1.5 + Math.pow(t, 1.15) * 58 + Math.sin(y * 0.17) * 2.2 * t;
  }

  for (let y = vy; y < H; y++) {
    const jitterL = (rnd() - 0.5) * 1.6, jitterR = (rnd() - 0.5) * 1.6;
    const x0 = cx[y] - hw[y] + jitterL, x1 = cx[y] + hw[y] + jitterR;
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const edge = Math.abs(x - cx[y]) / Math.max(1, hw[y]);
      set(b, x, y, edge > 0.88 ? C.waterDeep : C.water);
    }
    // A broken lip rather than a continuous line, which read as a kerb.
    if (rnd() > 0.35) set(b, x0 - 1, y, C.bank);
    if (rnd() > 0.35) set(b, x1 + 1, y, C.bank);
  }

  // Ripples: staggered and varied, so the surface does not read as a ladder.
  let y = vy + 4;
  while (y < H) {
    if (hw[y] > 3 && rnd() > 0.25) {
      const count = 1 + Math.round(rnd() * 2);
      for (let i = 0; i < count; i++) {
        const rw = hw[y] * (0.12 + rnd() * 0.38);
        const rxc = cx[y] + (rnd() - 0.5) * hw[y] * 1.3;
        for (let x = Math.round(rxc - rw / 2); x <= Math.round(rxc + rw / 2); x++) {
          if (Math.abs(x - cx[y]) > hw[y] - 1) continue;
          set(b, x, y, C.waterLit);
        }
      }
    }
    y += 2 + Math.round(rnd() * 4);
  }

  for (const [rx, ry, r] of [[44, 252, 7], [120, 236, 6], [30, 274, 8], [136, 266, 6], [70, 286, 5]]) {
    blob(b, rx, ry, r, r * 0.55, C.rock, rnd, true);
    blob(b, rx - r * 0.2, ry - r * 0.25, r * 0.5, r * 0.28, C.rockLit, rnd, true);
  }
  return b;
}

// --------------------------------------------------------- 06 shrubs
function shrubs() {
  const b = buffer();
  const rnd = rng(97);
  const vy = 150;
  function riverCx(y) {
    const t = Math.max(0, (y - vy) / (H - vy));
    return 80 + (Math.sin(t * 2.6 + 0.35) * 26 + Math.sin(t * 5.9) * 7) * Math.pow(t, 0.55);
  }
  function riverHw(y) {
    const t = Math.max(0, (y - vy) / (H - vy));
    return 1.5 + Math.pow(t, 1.15) * 58;
  }

  // Clumps, not an even scatter: pick a few centres and cluster around them.
  const clumps = [];
  for (let i = 0; i < 16; i++) {
    const side = rnd() > 0.44 ? 1 : -1;                 // deliberately lopsided
    const y = 172 + rnd() * 106;
    clumps.push({ x: riverCx(y) + side * (riverHw(y) + 9 + rnd() * 34), y: y, r: 6 + rnd() * 11 });
  }
  for (const cl of clumps) {
    const n = 5 + Math.round(rnd() * 9);
    for (let i = 0; i < n; i++) {
      const x = cl.x + (rnd() - 0.5) * cl.r * 2.1;
      const y = cl.y + (rnd() - 0.5) * cl.r * 1.1;
      if (x < -8 || x > W + 8) continue;
      if (Math.abs(x - riverCx(y)) < riverHw(y) - 1) continue;   // keep out of the water
      const r = 3 + rnd() * 5;
      const pick = rnd();
      blob(b, x, y, r, r * 0.6, pick > 0.7 ? C.leafA : pick > 0.4 ? C.leafB : C.leafC, rnd, true);
      if (rnd() > 0.7) blob(b, x + (rnd() - 0.5) * r, y - r * 0.55, r * 0.5, r * 0.28, C.leafA, rnd, true);
    }
  }
  for (let i = 0; i < 26; i++) {
    const side = rnd() > 0.5 ? 1 : -1;
    const y = 200 + rnd() * 84;
    const x = riverCx(y) + side * (riverHw(y) + 4 + rnd() * 14);
    blob(b, x, y, 2 + rnd() * 3, 2 + rnd() * 2, rnd() > 0.5 ? C.coralA : C.coralC, rnd, true);
  }
  return b;
}

// ---------------------------------------------------------- 07 frame
function frame() {
  const b = buffer();
  const rnd = rng(131);

  // Two trees hard against the edges, most of each already off-screen. Their job is to close
  // the composition, so they are irregular and nearly black rather than tidy columns.
  const trunks = [
    { x: -4, w: 17, lean: 2.1, phase: 0.4 },
    { x: 148, w: 18, lean: -2.5, phase: 2.1 },
  ];
  for (const t of trunks) {
    for (let y = 0; y < H; y++) {
      const lean = Math.sin(y * 0.009 + t.phase) * t.lean + Math.sin(y * 0.031 + t.phase) * 0.8;
      const widen = 1 + (y / H) * 0.14;                 // barely thicken toward the ground
      const w = Math.round(t.w * widen);
      for (let i = 0; i < w; i++) {
        const x = t.x + i + lean;
        const shade = i < 2 ? C.barkDark : i > w - 3 ? C.barkLit : C.bark;
        set(b, x, y, shade);
      }
      if (rnd() > 0.86) set(b, t.x + 1 + rnd() * (w - 2) + lean, y, C.barkDark);
    }
  }

  // Canopy closing over the top, heaviest in the corners.
  for (let i = 0; i < 34; i++) {
    const corner = rnd() > 0.4;
    const x = corner ? (rnd() > 0.5 ? rnd() * 44 : W - rnd() * 44) : rnd() * W;
    const y = -10 + rnd() * (corner ? 26 : 10);
    blob(b, x, y, 9 + rnd() * 16, 6 + rnd() * 10, rnd() > 0.4 ? C.frame : C.frameDark, rnd, true);
  }
  // Sprays hanging off the edge trees, thinning toward the middle of the frame.
  for (let i = 0; i < 46; i++) {
    const left = rnd() > 0.5;
    const y = 6 + rnd() * 276;
    // Between the canopy and the understorey the frame is open sky, so sprays there would
    // float unattached. Reach in only where something could plausibly be growing.
    const open = y > 42 && y < 150;
    const reach = Math.pow(rnd(), 2.0) * (open ? 12 : 34);
    const x = left ? reach - 3 : W - reach + 3;
    blob(b, x, y, 5 + rnd() * (open ? 5 : 8), 3 + rnd() * (open ? 4 : 6),
      rnd() > 0.28 ? C.frame : C.frameDark, rnd, true);
  }
  return b;
}

// Order matters: the ground sits under the near forest, which stands on it.
const LAYERS = [
  ['01-sky', sky], ['02-far-ridge', farRidge], ['03-mid-forest', midForest],
  ['04-ground', ground], ['05-river', river], ['06-near-forest', nearForest],
  ['07-shrubs', shrubs], ['08-frame', frame],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of LAYERS) {
  fs.writeFileSync(path.join(OUT, name + '.png'), encodePNGA(fn(), W, H, 1));
}
console.log('drafted ' + LAYERS.length + ' layers at ' + W + 'x' + H + ' -> art/layers/');
