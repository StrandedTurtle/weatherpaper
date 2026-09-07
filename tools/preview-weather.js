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

function Surface(rgba) {
  const d = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) d[i * 3 + c] = rgba[i * 4 + c];
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

function grade(s, cloud) {
  if (cloud <= 0.02) return;
  const sat = 1 - 0.55 * cloud, dim = 1 - 0.22 * cloud;
  for (let i = 0; i < W * H; i++) {
    const r = s.d[i * 3], g = s.d[i * 3 + 1], b = s.d[i * 3 + 2];
    const l = 0.213 * r + 0.715 * g + 0.072 * b;
    s.d[i * 3] = Math.min(255, (l + (r - l) * sat) * dim);
    s.d[i * 3 + 1] = Math.min(255, (l + (g - l) * sat) * dim);
    s.d[i * 3 + 2] = Math.min(255, (l + (b - l) * sat) * dim * 1.02);
  }
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
    const count = Math.round((30 + 90 * intensity) * (0.55 + depth));
    const speed = (150 + 260 * depth) * (0.65 + 0.6 * intensity);
    const len = (3 + 6 * depth) * U;
    const thick = layer === 2 ? 2 * U : U;
    const slant = wind * len * 1.35;
    const alpha = Math.min(200, Math.max(14, (34 + 78 * depth) * (0.5 + 0.5 * intensity))) / 255;
    for (let i = 0; i < count; i++) {
      const seed = layer * 977 + i;
      const vr = 0.75 + hash(seed, 23) * 0.5;
      const y = (hash(seed, 31) * H + t * speed * vr) % (H + len);
      let x = (hash(seed, 11) * W + t * speed * vr * wind * 0.45) % W;
      if (x < 0) x += W;
      line(s, x, y, x - slant, y - len, thick, RAIN, alpha);
    }
  }
  const splashes = Math.round(10 * intensity);
  const sa = Math.min(110, 58 * intensity) / 255;
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
  const count = Math.round(46 + 150 * intensity);
  for (let i = 0; i < count; i++) {
    const g2 = hash(i, 7);
    const size = g2 > 0.88 ? 3 * U : g2 > 0.60 ? 2 * U : U;
    const depth = size / (3 * U);
    const fall = (14 + 26 * depth) * (0.7 + 0.6 * intensity);
    const sway = (2 + hash(i, 17) * 6) * U;
    const period = 2.2 + hash(i, 29) * 3.4;
    const y = (hash(i, 37) * H + t * fall) % (H + size);
    let x = hash(i, 43) * W + Math.sin(t / period + hash(i, 53) * 6.283) * sway + wind * t * 22 * depth;
    x = ((x % W) + W) % W;
    const a = Math.min(235, Math.max(40, (110 + 110 * depth) * (0.55 + 0.45 * intensity))) / 255;
    s.rect(x, y, size, size, SNOW, a);
  }
}

function fog(s, t, amount, wind) {
  if (amount <= 0.02) return;
  const band = Math.max(2, U * 2);
  function density(y) {
    const f = Math.min(1, Math.max(0, y / H));
    const peak = 0.56, spread = f < peak ? 0.30 : 0.46;
    const d = 1 - Math.min(1, Math.abs(f - peak) / spread);
    return d * d;
  }
  let y = H * 0.18;
  while (y < H) {
    const a = amount * density(y) * 0.44;
    const stepped = Math.round(a * 6) / 6;
    if (stepped > 0) s.rect(0, y, W, band, FOG, Math.min(120, stepped * 255) / 255);
    y += band;
  }
  for (let i = 0; i < 8; i++) {
    const wy = H * (0.32 + hash(i, 13) * 0.48) + Math.sin(t * 0.22 + i) * H * 0.012;
    const d = density(wy);
    if (d <= 0.02) continue;
    const span = W * (0.30 + hash(i, 17) * 0.5);
    const tall = band * (3 + hash(i, 31) * 4);
    const speed = (5 + wind * 30) * (0.5 + hash(i, 19));
    const x = (hash(i, 23) * (W + span) + t * speed) % (W + span) - span;
    const peakA = amount * d * (0.10 + hash(i, 29) * 0.12);
    const cols = Math.max(1, Math.round(span / U));
    const rows = Math.max(1, Math.round(tall / band));
    for (let c = 0; c < cols; c++) {
      const hu = Math.sin((c / cols) * Math.PI);
      if (hu <= 0.02) continue;
      for (let r2 = 0; r2 < rows; r2++) {
        const vu = Math.sin(((r2 + 0.5) / rows) * Math.PI);
        const a = peakA * hu * hu * vu;
        const bias = (BAYER[(r2 & 3) * 4 + (c & 3)] / 16 - 0.5) * (1 / 8);
        const stepped = Math.round((a + bias) * 8) / 8;
        if (stepped <= 0) continue;
        s.rect(x + c * U, wy + r2 * band, U, band, FOG, Math.min(120, stepped * 255) / 255);
      }
    }
  }
}

const CASES = [
  { label: 'clear', frame: 'midday', cloud: 0.05, t: 3 },
  { label: 'overcast', frame: 'midday', cloud: 0.95, t: 3 },
  { label: 'drizzle', frame: 'midday', cloud: 0.7, rain: 0.3, wind: 0.2, t: 3.4 },
  { label: 'rain+wind', frame: 'midday', cloud: 0.85, rain: 0.62, wind: 0.6, t: 5.1 },
  { label: 'heavy rain', frame: 'dusk', cloud: 1.0, rain: 1.0, wind: 0.85, t: 7.7 },
  { label: 'snow', frame: 'dawn', cloud: 0.6, snow: 0.7, wind: 0.25, t: 9.2 },
  { label: 'fog', frame: 'morning', cloud: 0.5, fog: 0.85, wind: 0.05, t: 4.5 },
];

const g = 2, OW = CASES.length * (W + g) + g, OH = H + g * 2;
const out = new Uint8Array(OW * OH * 3).fill(28);

CASES.forEach((c, i) => {
  const img = decodePNG(fs.readFileSync(path.join(ROOT, 'art/frames', c.frame + '.png')));
  const s = Surface(img.rgba);
  grade(s, c.cloud || 0);
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
