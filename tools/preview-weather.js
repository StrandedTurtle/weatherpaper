'use strict';
// PREVIEW AID ONLY. Mirrors the formulas in scene/Effects.kt so the weather can be judged
// without building and installing. Not the implementation of record - if the two drift, the
// Kotlin is right and this file is stale.
//
//   node tools/preview-weather.js
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const { decodePNG } = require('./png-decode.js');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/frames.json'), 'utf8'));
const W = manifest.width, H = manifest.height;
const U = 1;                                  // one artwork pixel, as on device

const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];

function hash(i, salt) {
  let n = (Math.imul(i, 374761393) + Math.imul(salt, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function Surface(pixels, packed) {
  const d = new Uint8Array(W * H * 3);
  if (packed) d.set(pixels);
  else for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) d[i * 3 + c] = pixels[i * 4 + c];
  return {
    d: d,
    blend: function (x, y, col, a) {
      x = Math.round(x); y = Math.round(y);
      if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * (1 - a) + col[c] * a);
    },
    rect: function (x, y, w, h, col, a) {
      for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
        for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.blend(xx, yy, col, a);
      }
    },
  };
}

const RAIN = [0xBF, 0xD4, 0xDC], SNOW = [0xF2, 0xF8, 0xFA], FOG = [0xB6, 0xC6, 0xC2];

/**
 * How overcast the sky is, 0..1 - mirrors SceneRenderer.overcastAmount.
 *
 * Cloud cover is a fraction, but it does not read linearly: a quarter-covered sky still looks
 * like a clear day, and it is only well past half that the light changes character.
 */
function overcastAmount(cloud, isFog) {
  if (isFog) return 1;
  const t = Math.min(1, Math.max(0, (Math.min(1, Math.max(0, cloud)) - 0.28) / (0.94 - 0.28)));
  return t * t * (3 - 2 * t);
}

/** Blend two frames of the same time, clear toward overcast. */
function blendCondition(clearImg, overImg, c) {
  const d = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    for (let k = 0; k < 3; k++) {
      d[i * 3 + k] = Math.round(clearImg.rgba[i * 4 + k] * (1 - c) + overImg.rgba[i * 4 + k] * c);
    }
  }
  return d;
}

function line(s, x0, y0, x1, y1, thick, col, a) {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= steps; k++) {
    const x = x0 + (x1 - x0) * (k / steps), y = y0 + (y1 - y0) * (k / steps);
    for (let w = 0; w < thick; w++) s.blend(x + w, y, col, a);
  }
}

function rain(s, t, intensity, wind) {
  if (intensity <= 0) return;
  for (let layer = 0; layer < 3; layer++) {
    const depth = layer / 2;
    const count = Math.round((44 + 150 * intensity) * (0.6 + depth));
    const speed = (150 + 260 * depth) * (0.65 + 0.6 * intensity);
    const len = (2 + 3.5 * depth) * U;
    const thick = U;
    const slant = wind * len * 1.1;
    const alpha = Math.min(132, Math.max(10, (20 + 46 * depth) * (0.55 + 0.45 * intensity))) / 255;
    for (let i = 0; i < count; i++) {
      const seed = layer * 977 + i;
      const vr = 0.75 + hash(seed, 23) * 0.5;
      const y = (hash(seed, 31) * H + t * speed * vr) % (H + len);
      let x = (hash(seed, 11) * W + t * speed * vr * wind * 0.45) % W;
      if (x < 0) x += W;
      line(s, x, y, x - slant, y - len, thick, RAIN, alpha);
    }
  }
  const splashes = Math.round(12 * intensity);
  const sa = Math.min(84, 44 * intensity) / 255;
  for (let i = 0; i < splashes; i++) {
    const phase = (t / 0.5 + hash(i, 61)) % 1;
    if (phase > 0.30) continue;
    const x = hash(i, 71) * W, y = H * (0.70 + hash(i, 83) * 0.28);
    const r = (1 + phase * 6) * U;
    s.rect(x - r, y, U, U, RAIN, sa);
    s.rect(x + r, y, U, U, RAIN, sa);
  }
}

function snow(s, t, intensity, wind) {
  const count = Math.round(110 + 300 * intensity);
  for (let i = 0; i < count; i++) {
    const g2 = hash(i, 7);
    const size = g2 > 0.72 ? 2 * U : U;
    const depth = g2 > 0.72 ? 1 : 0.45;
    const fall = (14 + 26 * depth) * (0.7 + 0.6 * intensity);
    const sway = (2 + hash(i, 17) * 6) * U;
    const period = 2.2 + hash(i, 29) * 3.4;
    const y = (hash(i, 37) * H + t * fall) % (H + size);
    let x = hash(i, 43) * W + Math.sin(t / period + hash(i, 53) * 6.283) * sway + wind * t * 22 * depth;
    x = ((x % W) + W) % W;
    const a = Math.min(168, Math.max(22, (44 + 96 * depth) * (0.55 + 0.45 * intensity))) / 255;
    s.rect(x, y, size, size, SNOW, a);
  }
}

function fog(s, t, amount, wind) {
  if (amount <= 0.02) return;
  function density(y) {
    const f = Math.min(1, Math.max(0, y / H));
    const peak = 0.56, spread = f < peak ? 0.30 : 0.46;
    const d = 1 - Math.min(1, Math.abs(f - peak) / spread);
    return d * d;
  }
  // Base haze: one pixel per row, continuous alpha, no quantisation.
  for (let y = Math.round(H * 0.16); y < H; y += U) {
    const a = amount * density(y) * 0.46;
    if (a > 0.002) s.rect(0, y, W, U, FOG, Math.min(116, a * 255) / 255);
  }
  // Banks, dithered on a two-pixel cell.
  const cell = U * 2;
  for (let i = 0; i < 9; i++) {
    const by = H * (0.30 + hash(i, 13) * 0.50) + Math.sin(t * 0.19 + i) * H * 0.014;
    const d = density(by);
    if (d <= 0.02) continue;
    const span = W * (0.34 + hash(i, 17) * 0.56);
    const tall = cell * (3 + hash(i, 31) * 4);
    const speed = (4 + wind * 26) * (0.5 + hash(i, 19));
    const x = (hash(i, 23) * (W + span) + t * speed) % (W + span) - span;
    const peakA = amount * d * (0.09 + hash(i, 29) * 0.11);
    const cols = Math.max(1, Math.round(span / cell));
    const rows = Math.max(1, Math.round(tall / cell));
    for (let c = 0; c < cols; c++) {
      const hu = Math.sin((c / cols) * Math.PI);
      if (hu <= 0.02) continue;
      const px = x + c * cell;
      if (px < -cell || px > W) continue;
      for (let r = 0; r < rows; r++) {
        const vu = Math.sin(((r + 0.5) / rows) * Math.PI);
        const a = peakA * hu * hu * vu;
        if (a < 0.014) continue;
        const bias = (BAYER[(r & 3) * 4 + (c & 3)] / 16 - 0.5) * (1 / 8) * Math.min(1, a / 0.10);
        const stepped = Math.round((a + bias) * 8) / 8;
        if (stepped <= 0) continue;
        s.rect(px, by + r * cell, cell, cell, FOG, Math.min(110, stepped * 255) / 255);
      }
    }
  }
}

const MOTE = [0xDC, 0xE4, 0xC8], FIREFLY = [0xE8, 0xD0, 0x60],
  LEAF_A = [0xC8, 0x7A, 0x34], LEAF_B = [0xA1, 0x55, 0x2A];

/** Mirrors Effects.seasonal. */
function seasonal(s, t, season, wind, night) {
  if (season === 'spring') {
    for (let i = 0; i < 22; i++) {
      const drift = 5 + hash(i, 3) * 7;
      let x = hash(i, 11) * W + Math.sin(t / (3 + hash(i, 13) * 4) + i) * 5 * U + wind * t * 12;
      x = ((x % W) + W) % W;
      const y = (hash(i, 17) * H + t * drift) % H;
      s.rect(x, y, U, U, MOTE, Math.round(92 + hash(i, 19) * 86) / 255);
    }
  } else if (season === 'summer') {
    if (night <= 0.05) return;
    for (let i = 0; i < 16; i++) {
      const period = 2.6 + hash(i, 23) * 2.8;
      const pulse = Math.sin((t / period + hash(i, 29)) * 6.283);
      if (pulse <= 0) continue;
      const x = ((hash(i, 31) * W + Math.sin(t / (5 + hash(i, 37) * 5) + i) * 7 * U) % W + W) % W;
      const y = H * (0.62 + hash(i, 41) * 0.30) + Math.sin(t / 3.4 + i * 2) * 3 * U;
      s.rect(x, y, U, U, FIREFLY, Math.min(210, pulse * pulse * 210 * night) / 255);
    }
  } else if (season === 'autumn') {
    for (let i = 0; i < 20; i++) {
      const g2 = hash(i, 43);
      const col = g2 > 0.55 ? LEAF_A : LEAF_B;
      const fall = 12 + hash(i, 47) * 14;
      const period = 1.6 + hash(i, 53) * 2.2;
      const swing = Math.sin(t / period + hash(i, 59) * 6.283);
      let x = hash(i, 61) * W + swing * 9 * U + wind * t * 26;
      x = ((x % W) + W) % W;
      const y = (hash(i, 67) * H + t * fall) % (H + 2 * U);
      const wide = Math.abs(swing) > 0.55 ? 2 * U : U;
      s.rect(x, y, wide, U, col, Math.min(225, 120 + hash(i, 71) * 90) / 255);
    }
  }
}

const SEASONS = [
  { label: 'spring', time: 'morning', season: 'spring', night: 0, t: 6.2 },
  { label: 'summer night', time: 'night', season: 'summer', night: 1, t: 4.8 },
  { label: 'autumn', time: 'golden', season: 'autumn', wind: 0.35, t: 5.5 },
  { label: 'winter', time: 'midday', season: 'winter', cloud: 0.8, night: 0, t: 2.0 },
];

const CASES = [
  { label: 'clear', time: 'midday', cloud: 0.05, t: 3 },
  { label: 'partly', time: 'midday', cloud: 0.55, t: 3 },
  { label: 'overcast', time: 'midday', cloud: 0.98, t: 3 },
  { label: 'drizzle', time: 'morning', cloud: 0.7, rain: 0.3, wind: 0.2, t: 3.4 },
  { label: 'rain+wind', time: 'midday', cloud: 0.85, rain: 0.62, wind: 0.6, t: 5.1 },
  { label: 'heavy rain', time: 'dusk', cloud: 1.0, rain: 1.0, wind: 0.85, t: 7.7 },
  { label: 'snow', time: 'firstlight', cloud: 0.8, snow: 0.7, wind: 0.25, t: 9.2 },
  { label: 'fog', time: 'morning', cloud: 0.5, fog: 0.85, wind: 0.05, t: 4.5 },
];

const g = 2, OW = CASES.length * (W + g) + g, OH = H + g * 2;
const out = new Uint8Array(OW * OH * 3).fill(28);

CASES.forEach((c, i) => {
  const clearImg = decodePNG(fs.readFileSync(path.join(ROOT, 'art/frames', c.time + '-clear.png')));
  const overImg = decodePNG(fs.readFileSync(path.join(ROOT, 'art/frames', c.time + '-overcast.png')));
  const s = Surface(blendCondition(clearImg, overImg, overcastAmount(c.cloud || 0, !!c.fog)), true);
  fog(s, c.t, c.fog || (c.rain ? 0.14 : 0), c.wind || 0);
  if (c.rain) rain(s, c.t, c.rain, c.wind || 0);
  if (c.snow) snow(s, c.t, c.snow, c.wind || 0);
  const ox = g + i * (W + g);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 3, d = ((g + y) * OW + ox + x) * 3;
      out[d] = s.d[si]; out[d + 1] = s.d[si + 1]; out[d + 2] = s.d[si + 2];
    }
  }
});

fs.mkdirSync(path.join(ROOT, 'art/preview'), { recursive: true });
const file = path.join(ROOT, 'art/preview/weather.png');
fs.writeFileSync(file, encodePNG(out, OW, OH, 3));
console.log(CASES.map(c => c.label).join(' | '));
console.log('wrote ' + path.relative(ROOT, file));

// ---- seasons ----
const sg = 2, SW = SEASONS.length * (W + sg) + sg, SH = H + sg * 2;
const sout = new Uint8Array(SW * SH * 3).fill(28);
SEASONS.forEach((c, i) => {
  const clearImg = decodePNG(fs.readFileSync(path.join(ROOT, 'art/frames', c.time + '-clear.png')));
  const overImg = decodePNG(fs.readFileSync(path.join(ROOT, 'art/frames', c.time + '-overcast.png')));
  const s = Surface(blendCondition(clearImg, overImg, overcastAmount(c.cloud || 0, false)), true);
  seasonal(s, c.t, c.season, c.wind || 0, c.night || 0);
  const ox = sg + i * (W + sg);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 3, d = ((sg + y) * SW + ox + x) * 3;
      sout[d] = s.d[si]; sout[d + 1] = s.d[si + 1]; sout[d + 2] = s.d[si + 2];
    }
  }
});
const sfile = path.join(ROOT, 'art/preview/seasons.png');
fs.writeFileSync(sfile, encodePNG(sout, SW, SH, 3));
console.log(SEASONS.map(c => c.label).join(' | '));
console.log('wrote ' + path.relative(ROOT, sfile));
