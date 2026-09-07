'use strict';
// Relights the scene into one flattened image per time of day.
//
//   node art/relight.js
//
// The artwork is drawn as a clear night. Rather than lifting it at runtime with a colour matrix
// - which flattens it, because a matrix cannot know that sky and foliage want to move in
// different directions - each depth plane is remapped through its own ramp here, offline, and
// the result is flattened to a single PNG per time. That keeps every drawn detail (the mapping
// is by luminance, so structure survives) while letting the sky go blue and the canopy go green
// independently, and it is hand-tunable in a way a runtime filter is not.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('../tools/png.js');
const { decodePNG } = require('../tools/png-decode.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art/layers');
const OUT = path.join(ROOT, 'art/frames');

/** Which ramp each plane is lit by. */
const CLASS_OF = {
  '01-sky': 'sky',
  '02-stars': 'stars',
  '03-far-haze': 'haze',
  '04-mid-forest': 'far',
  '05-ground': 'ground',
  '06-cabin': 'wood',
  '07-near-forest': 'near',
  '08-foreground': 'near',
  '09-canopy': 'canopy',
};

/** How visible the stars-and-moon plane is at each time. */
const STARS = { night: 1, dawn: 0.30, morning: 0, midday: 0, golden: 0, dusk: 0.34 };

/**
 * Some stars are painted into the sky plane itself rather than the stars plane, so hiding that
 * plane does not remove them - and being the brightest pixels there, they land on the light end
 * of the sky ramp and survive as white specks in broad daylight.
 *
 * They are isolated single pixels, where clouds are broad areas, so an outlier against the local
 * neighbourhood identifies them without touching anything else.
 */
function despeckle(img, W, H) {
  const lum = new Float32Array(W * H);
  const opaque = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    opaque[i] = img.rgba[i * 4 + 3] >= 128 ? 1 : 0;
    lum[i] = 0.213 * img.rgba[i * 4] + 0.715 * img.rgba[i * 4 + 1] + 0.072 * img.rgba[i * 4 + 2];
  }
  const out = new Float32Array(lum);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!opaque[i]) continue;
      // Only opaque neighbours count. Averaging transparent ones as black made every pixel on a
      // sparse plane look like an outlier, which would have flattened the haze entirely.
      let sum = 0, n = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (opaque[j]) { sum += lum[j]; n++; }
      }
      if (n < 3) continue;                      // an edge pixel is not a speck
      const avg = sum / n;
      if (lum[i] - avg > 22) out[i] = avg;
    }
  }
  return out;
}

/**
 * Three stops per class - shadow, mid, light. Kept small deliberately: a handful of numbers per
 * time is something you can actually sit and tune, where a full 40-colour table per time is not.
 */
const TIMES = {
  night: null,                       // the artwork as drawn; no remap at all
  dawn: {
    sky: ['#161C30', '#5A4A6A', '#D89A92'],
    haze: ['#2A3040', '#565068', '#98868E'],
    far: ['#1A2430', '#32424A', '#5E7268'],
    near: ['#141C26', '#2A3638', '#506258'],
    canopy: ['#0A1016', '#1C2628', '#364638'],
    ground: ['#1A2228', '#32403C', '#586A58'],
    wood: ['#1C1A20', '#3A343C', '#665C60'],
  },
  morning: {
    sky: ['#6E92A4', '#A8C6C6', '#E8F2E6'],
    haze: ['#7E9C9A', '#A4BCB4', '#CEDED4'],
    far: ['#3E5E52', '#5A7C6A', '#88AC8C'],
    near: ['#2A4438', '#40604E', '#648870'],
    canopy: ['#14241C', '#263A2C', '#445C42'],
    ground: ['#2E4A34', '#486A46', '#729860'],
    wood: ['#3A3630', '#5A5246', '#887C64'],
  },
  midday: {
    sky: ['#6094BE', '#9CC2D4', '#E4F0EC'],
    haze: ['#88A8A4', '#AEC8BE', '#D2E2D6'],
    far: ['#466E5E', '#5E907A', '#8CC49A'],
    near: ['#2C4E3C', '#446C50', '#70A074'],
    canopy: ['#16281E', '#2A4430', '#4A6C4A'],
    ground: ['#325238', '#50784E', '#7EAE70'],
    wood: ['#423C34', '#665C4C', '#968870'],
  },
  golden: {
    sky: ['#7A92A6', '#C8B294', '#F8E2AE'],
    haze: ['#A09A88', '#C4B89C', '#E4D6B4'],
    far: ['#566044', '#7A8660', '#A6B27E'],
    near: ['#3A4230', '#5A6644', '#82905E'],
    canopy: ['#1C2014', '#363C24', '#565C36'],
    ground: ['#46482C', '#6C6E40', '#98985A'],
    wood: ['#4E4030', '#786248', '#A28460'],
  },
  dusk: {
    sky: ['#1A2040', '#6A4660', '#D4867A'],
    haze: ['#38364C', '#5E5668', '#847880'],
    far: ['#26303C', '#424C56', '#686E74'],
    near: ['#181E28', '#2E3640', '#4C5458'],
    canopy: ['#0C1014', '#1E2428', '#383E42'],
    ground: ['#20242A', '#3A4042', '#5A625C'],
    wood: ['#221E24', '#443C40', '#685C5C'],
  },
};

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Sample a 3-stop ramp at t in 0..1. */
function ramp(stops, t) {
  const A = hex(stops[0]), B = hex(stops[1]), C = hex(stops[2]);
  if (t <= 0.5) {
    const u = t / 0.5;
    return [lerp(A[0], B[0], u), lerp(A[1], B[1], u), lerp(A[2], B[2], u)];
  }
  const u = (t - 0.5) / 0.5;
  return [lerp(B[0], C[0], u), lerp(B[1], C[1], u), lerp(B[2], C[2], u)];
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).sort();
const planes = files.map(f => {
  const name = f.replace(/\.png$/, '');
  const img = decodePNG(fs.readFileSync(path.join(SRC, f)));
  // Each plane is normalised against its OWN luminance range, so a dark canopy still uses the
  // full width of its ramp instead of collapsing into the shadow end.
  let lo = 255, hi = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    if (img.rgba[i * 4 + 3] < 128) continue;
    const L = 0.213 * img.rgba[i * 4] + 0.715 * img.rgba[i * 4 + 1] + 0.072 * img.rgba[i * 4 + 2];
    if (L < lo) lo = L;
    if (L > hi) hi = L;
  }
  const cls = CLASS_OF[name] || 'near';
  return {
    name: name, cls: cls, img: img, lo: lo, hi: Math.max(hi, lo + 1),
    // Precomputed once; only the sky needs it, and only on the daylit frames.
    // Sky and haze are where painted-in stars live; foliage highlights are intended detail.
    dayLum: (cls === 'sky' || cls === 'haze') ? despeckle(img, img.width, img.height) : null,
  };
});

const W = planes[0].img.width, H = planes[0].img.height;
fs.mkdirSync(OUT, { recursive: true });

for (const [time, table] of Object.entries(TIMES)) {
  const out = new Uint8Array(W * H * 3);
  for (const p of planes) {
    const stops = table ? table[p.cls] : null;
    const starAlpha = p.cls === 'stars' ? (STARS[time] !== undefined ? STARS[time] : 1) : 1;
    if (starAlpha <= 0) continue;

    for (let i = 0; i < W * H; i++) {
      const a = (p.img.rgba[i * 4 + 3] / 255) * starAlpha;
      if (a <= 0) continue;
      const r = p.img.rgba[i * 4], g = p.img.rgba[i * 4 + 1], b = p.img.rgba[i * 4 + 2];
      let c;
      if (!stops) {
        c = [r, g, b];                                        // night: exactly as drawn
      } else {
        const daylit = STARS[time] === 0;
        const L = (p.dayLum && daylit) ? p.dayLum[i]
          : 0.213 * r + 0.715 * g + 0.072 * b;
        const t = Math.min(1, Math.max(0, (L - p.lo) / (p.hi - p.lo)));
        c = ramp(stops, t);
      }
      for (let k = 0; k < 3; k++) {
        out[i * 3 + k] = Math.round(out[i * 3 + k] * (1 - a) + c[k] * a);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, time + '.png'), encodePNG(out, W, H, 1));
}

console.log('relit ' + Object.keys(TIMES).length + ' frames at ' + W + 'x' + H + ' -> art/frames/');
console.log('planes: ' + planes.map(p => p.name + '(' + p.cls + ')').join(', '));
