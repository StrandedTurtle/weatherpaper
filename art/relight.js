'use strict';
// Relights the scene into one flattened image per time of day and sky condition.
//
//   node art/relight.js              # writes art/frames/*.png
//   node art/relight.js --report     # the depth ladder each frame achieved
//   node art/relight.js --contrast   # detail kept per material, against the source
//   node art/relight.js --seams      # discontinuity where the old plane bands used to meet
//
// The artwork is drawn as a clear night. Relighting it offline, rather than filtering it at
// runtime, is what lets the sky go blue while the canopy goes green - a colour matrix cannot know
// they want to move in different directions.
//
// Lighting is by MATERIAL, not by plane. The planes in art/layers/ are horizontal bands: canopy is
// rows 0-71, near-forest 33-225, foreground 226-287. A tree runs through all three, and because
// each plane was also normalised against its own luminance range, identical bark either side of an
// arbitrary row got a different affine map - measured down column x=14, a source that was
// continuous (luminance 20 -> 19) came out as 31 -> 13. That step was the unnatural edge people
// could see, and nothing in the picture is there. art/segment.js now says what each pixel IS, and
// every pixel of a material is normalised together, so a tree is one tree from top to bottom.
//
// The sky is drawn rather than relit: see art/sky.js for why.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('../tools/png.js');
const { decodePNG } = require('../tools/png-decode.js');
const { segment, MATERIALS } = require('./segment.js');
const { paintSky } = require('./sky.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art/layers');
const OUT = path.join(ROOT, 'art/frames');

/**
 * Report order: roughly brightest to darkest, which is how the frames actually come out.
 *
 * It is no longer a depth ladder that gets imposed. Ordering now falls out of the artwork's own
 * values through the shared tone curve - the source medians run foliage 24, haze 47, grass 66, and
 * a monotone curve cannot reorder them. Imposing a ladder on top is what produced the banding.
 */
const LADDER = ['sky', 'grass', 'stone', 'haze', 'wood', 'foliage'];

/** How visible the stars-and-moon plane is at each time. */
const STARS = {
  night: 1, firstlight: 0.55, dawn: 0.18, morning: 0, midday: 0,
  golden: 0, dusk: 0.20, twilight: 0.62,
};

/**
 * The scene's tone curve per time of day: output luminance at the darkest, the median and the
 * brightest of the source. One curve for the WHOLE picture, not one per material.
 *
 * This is the heart of the rewrite. Giving each material its own level meant two adjacent pixels
 * of identical source paint - both pure black, say - could land at 17 and 67 depending on which
 * side of a material boundary they fell, which is an edge the artwork does not have. Measured
 * across the old plane boundaries, those steps reached 3.7x.
 *
 * So materials change HUE, not brightness. Brightness comes from the source, through one shared
 * curve, which makes the mapping monotone across the entire image: equal paint in, equal light
 * out, everywhere. Seams cannot exist by construction.
 *
 * The depth ladder survives without being imposed, because the artwork already contains it - the
 * source medians run foliage 24, haze 47, grass 66, and any monotone curve preserves that order.
 */
const TONE = {
  // A clear night is passed through untouched, so this curve is only ever reached under cloud -
  // and it has to be a NIGHT curve. Falling back to midday's made an overcast night brighter than
  // a clear one, which is the wrong way round twice over.
  night: [2, 26, 78],
  firstlight: [2, 26, 84],
  dawn: [3, 40, 122],
  morning: [4, 60, 178],
  midday: [4, 70, 200],
  golden: [4, 58, 174],
  dusk: [3, 36, 112],
  twilight: [2, 24, 78],
};

/**
 * What each material is made of, per time: a tint, and a small level trim.
 *
 * The trim is kept within about 5% of the shared curve, and that bound is load-bearing: it is the
 * only thing left that can put a step at a material boundary, and it caps that step at 1.1x. At
 * 10% the seam check reported 1.20x between mist and the trees behind it - small, but it is
 * exactly the kind of edge this pass exists to remove.
 */
const TIMES = {
  night: {
    // A clear night is the artwork as drawn, so this is only reached under cloud - and an overcast
    // night has no moon and no stars, so it cannot be the same picture either way.
    passthroughWhenClear: true,
    sun: '#8898B8', shade: '#0A0E18', sky: [26, '#2A3348'],
    haze: ['#454C60', 1.04], foliage: ['#1E2A24', 0.97], grass: ['#3A4A3E', 1.01],
    wood: ['#33303A', 0.99], stone: ['#3E4246', 1.02],
  },
  firstlight: {
    // The cold blue hour before sunrise. No warmth anywhere - that is what makes it read as
    // before rather than after, since its twin at the same level is warm.
    sun: '#B8C4E0', shade: '#101628', sky: [56, '#5A6890'],
    haze: ['#5A6480', 1.05], foliage: ['#26303C', 0.97], grass: ['#374A46', 1.01],
    wood: ['#3E4048', 0.99], stone: ['#3E4650', 1.02],
  },
  dawn: {
    // Sunrise proper: a warm rim on a still-cool sky.
    sun: '#FFC0A0', shade: '#1A2038', sky: [104, '#8C86AC'],
    haze: ['#9A8898', 1.05], foliage: ['#2E3C42', 0.97], grass: ['#4E6250', 1.02],
    wood: ['#6A5A58', 1.00], stone: ['#5E5E64', 1.02],
  },
  morning: {
    // Softer and hazier than noon: the mist sits higher against the far trees.
    sun: '#FFF4E4', shade: '#2C4258', sky: [150, '#93BEDA'],
    haze: ['#A6C0BC', 1.06], foliage: ['#33604A', 0.97], grass: ['#63945E', 1.02],
    wood: ['#8A7860', 1.00], stone: ['#8A9096', 1.02],
  },
  midday: {
    // The strongest light of the day: deepest sky, greenest ground, hardest silhouettes.
    sun: '#FFF9E2', shade: '#20364E', sky: [172, '#74AEE0'],
    haze: ['#8EB4B4', 1.05], foliage: ['#356A46', 0.96], grass: ['#71A65C', 1.02],
    wood: ['#977C5A', 1.00], stone: ['#969C9E', 1.02],
  },
  golden: {
    // Only what the low sun actually reaches goes warm. Making everything orange turned the whole
    // picture into one sepia wash, so the trees stay green - they are in their own shadow - and
    // the warmth is carried by the sky, the clearing and the cabin.
    sun: '#FFCE8A', shade: '#2A2E44', sky: [148, '#C2A8B0'],
    haze: ['#CCAE9A', 1.05], foliage: ['#3C5434', 0.97], grass: ['#8A9450', 1.02],
    wood: ['#A88254', 1.01], stone: ['#9E9080', 1.02],
  },
  dusk: {
    // Sunset proper: red-orange in the west, and warmer than dawn at the same level so the two
    // ends of the day never look like each other.
    sun: '#FF9A70', shade: '#181630', sky: [96, '#B0788A'],
    haze: ['#9C7080', 1.05], foliage: ['#32323E', 0.97], grass: ['#54544E', 1.02],
    wood: ['#6E4E4E', 1.00], stone: ['#5E585C', 1.02],
  },
  twilight: {
    // The blue hour after sunset: dim, but with the last of the west still in it.
    sun: '#C88C80', shade: '#12132A', sky: [50, '#6A6088'],
    haze: ['#605A78', 1.05], foliage: ['#262832', 0.97], grass: ['#38423E', 1.01],
    wood: ['#443A42', 0.99], stone: ['#464048', 1.02],
  },
};

/**
 * Sky conditions, as modifiers on the tone curve rather than tables of their own.
 *
 * Overcast is not a clear scene with the colour turned down, which is all a runtime saturation
 * matrix could make it. Under cloud the light source stops being a point and becomes the whole
 * sky, so shadow and highlight both collapse toward the midtone - which is a COMPRESSION of the
 * tone curve, and lifting its floor is most of what "the shadows fill in" means.
 */
const CONDITIONS = {
  clear: { compress: 0, lift: 0, midLift: 1, desat: 0, cloud: 0.30, skyLevel: 1 },
  // An overcast day is BRIGHT and flat, not dim. Cutting the level as well as compressing took the
  // light away twice and produced a murky dusk.
  // `midLift` is the part that took two goes. Compressing the curve pulls everything above the
  // midtone down toward it, and most of the picture - grass, rock, mist - lives up there, so
  // compression alone reads as gloom rather than as flat light. Raising the midtone puts the light
  // back without restoring the shadows it is meant to have filled in. Desaturation is gentler than
  // it was for the same reason: at 0.5 an overcast day looked ill rather than grey.
  overcast: { compress: 0.42, lift: 0.30, midLift: 1.12, desat: 0.34, cloud: 1, skyLevel: 0.95 },
};

/**
 * Output quantisation step, and the ordered-dither matrix that softens it.
 *
 * Chosen by eye against the source: coarse enough that the result reads as paint rather than as a
 * photograph, fine enough not to posterise the long gradients in the grass.
 */
const QUANT = 6;
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function lum(c) { return 0.213 * c[0] + 0.715 * c[1] + 0.072 * c[2]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

/** Scale a colour to a target luminance, desaturating rather than clipping if it would blow out. */
function atLuminance(c, target) {
  const L = Math.max(lum(c), 0.5);
  let out = [c[0] * target / L, c[1] * target / L, c[2] * target / L];
  const peak = Math.max(out[0], out[1], out[2]);
  if (peak > 255) {
    // Pushing a saturated tint this bright would clip one channel and skew the hue, so bleed it
    // toward white instead - which is what an over-exposed colour actually does.
    const room = (255 - target) / Math.max(peak - target, 0.5);
    out = mix([target, target, target], out, Math.max(0, Math.min(1, room)));
  }
  return out.map(v => Math.max(0, Math.min(255, v)));
}

/**
 * The tone curve for one frame: source position 0..1 in, output luminance out.
 *
 * `compress` pulls both ends toward the midtone and `lift` raises the floor, which together are
 * what an overcast sky does to a scene.
 */
function toneCurve(tone, cond) {
  let [lo, mid, hi] = tone;
  mid = mid * cond.midLift;
  lo = lo + (mid - lo) * cond.compress + cond.lift * mid * 0.30;
  hi = Math.max(mid + 1, hi - (hi - mid) * cond.compress);
  return u => (u <= 0.5 ? lo + (mid - lo) * (u / 0.5) : mid + (hi - mid) * ((u - 0.5) / 0.5));
}

/**
 * The colour of one material at a given point on the curve.
 *
 * Tint first, THEN set the brightness. Mixing a stop toward the sun colour after scaling it also
 * drags its luminance up toward the sun's - a canopy highlight meant for luminance 39 once landed
 * at 123, which is why foliage came out grey and dusty. Warm light and cool shade are a change of
 * hue at a given brightness, not a change of brightness.
 */
function shade(tintHex, level, u, L, sunHex, shadeHex, desat) {
  let tint = hex(tintHex);
  if (desat > 0) { const g = lum(tint); tint = mix(tint, [g, g, g], desat); }
  // Shadows take the ambient colour, highlights take the sun's. Both are hue moves only.
  if (u < 0.5) tint = mix(tint, hex(shadeHex), (0.5 - u) * 0.62);
  else tint = mix(tint, hex(sunHex), (u - 0.5) * 0.56);
  return atLuminance(tint, Math.max(1, Math.min(252, L * level)));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];
}

function iqr(vals) {
  if (vals.length < 4) return 0;
  const v = vals.slice().sort((a, b) => a - b);
  const q = f => v[Math.round(f * (v.length - 1))];
  return q(0.75) - q(0.25);
}

// ------------------------------------------------------------------ setup
const report = process.argv.includes('--report');
const contrast = process.argv.includes('--contrast');
const seams = process.argv.includes('--seams');

const scene = segment();
const { W, H, N, mat, depth, sky } = scene;
const srcL = new Float32Array(N);
for (let i = 0; i < N; i++) {
  srcL[i] = lum([scene.scene.rgba[i * 4], scene.scene.rgba[i * 4 + 1], scene.scene.rgba[i * 4 + 2]]);
}

// The stars-and-moon plane, composited over the generated sky.
const starsImg = fs.existsSync(path.join(SRC, '02-stars.png'))
  ? decodePNG(fs.readFileSync(path.join(SRC, '02-stars.png'))) : null;

/**
 * A despeckled copy of the source luminance, for the mist only.
 *
 * Stars are painted into the far-haze plane as well as into the stars plane, and there they are
 * part of the paint rather than an overlay - so holding the stars plane out of the base does not
 * remove them. Being the brightest pixels in that material they sit at the top of the tone curve
 * and survive as white sparkle in broad daylight.
 *
 * A 3x3 median is the exact tool for isolated outliers: it can only return a value one of the
 * neighbours already had, so cloud edges keep their shape while a lone bright pixel cannot. An
 * outlier-and-average test was tried first and let them through, because a speck two pixels across
 * drags its own local average up and hides in it. Used only when the frame is lit; at night those
 * same pixels are stars and belong.
 */
const MIST = MATERIALS.indexOf('haze');
const cleanL = (() => {
  const out = Float32Array.from(srcL);
  const win = [];
  for (let pass = 0; pass < 2; pass++) {
    const cur = Float32Array.from(out);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (mat[i] !== MIST) continue;
        win.length = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) win.push(cur[i + dy * W + dx]);
        }
        win.sort((a, b) => a - b);
        out[i] = win[4];
      }
    }
  }
  return out;
})();

/**
 * Normalisation over the WHOLE picture, not per material - this is what guarantees no seams.
 *
 * Bounds are percentiles rather than min/max: one stray bright pixel would otherwise set the
 * ceiling and squash everything into the bottom of the curve.
 */
const GLOBAL = (() => {
  const vals = [];
  for (let i = 0; i < N; i++) if (!sky[i]) vals.push(srcL[i]);
  vals.sort((a, b) => a - b);
  const lo = percentile(vals, 0.02);
  const hi = Math.max(percentile(vals, 0.98), lo + 1);
  const med = percentile(vals, 0.5);
  return { lo, hi, med, tMed: Math.min(0.92, Math.max(0.08, (med - lo) / (hi - lo))) };
})();

/** Per-material source statistics, kept only so `--contrast` has something to compare against. */
const STATS = {};
for (const m of MATERIALS) {
  const vals = [];
  for (let i = 0; i < N; i++) if (MATERIALS[mat[i]] === m) vals.push(srcL[i]);
  vals.sort((a, b) => a - b);
  STATS[m] = { n: vals.length, iqr: iqr(vals) };
}

/** The lowest row any sky reaches, so the generated gradient knows where its horizon is. */
let horizonRow = 0;
for (let i = 0; i < N; i++) if (sky[i]) horizonRow = Math.max(horizonRow, (i / W) | 0);

fs.mkdirSync(OUT, { recursive: true });
const achieved = {}, measured = {};

// ------------------------------------------------------------------ render
for (const [time, table] of Object.entries(TIMES)) {
  for (const [condName, cond] of Object.entries(CONDITIONS)) {
    const passthrough = condName === 'clear' && table.passthroughWhenClear;
    const out = new Uint8Array(N * 3);

    // 1. Everything that is not sky, lit through the SHARED curve and its own tint.
    const curve = passthrough ? null : toneCurve(TONE[time], cond);
    for (let i = 0; i < N; i++) {
      if (sky[i]) continue;
      const m = MATERIALS[mat[i]];
      const spec = table[m];
      let c;
      if (passthrough || !spec || !curve) {
        c = [scene.scene.rgba[i * 4], scene.scene.rgba[i * 4 + 1], scene.scene.rgba[i * 4 + 2]];
      } else {
        // One normalisation for the whole picture, so equal paint maps to equal light wherever it
        // appears. This is the property that makes seams impossible.
        const L = mat[i] === MIST ? cleanL[i] : srcL[i];
        const t = Math.min(1, Math.max(0, (L - GLOBAL.lo) / (GLOBAL.hi - GLOBAL.lo)));
        const u = t <= GLOBAL.tMed ? 0.5 * (t / GLOBAL.tMed) : 0.5 + 0.5 * ((t - GLOBAL.tMed) / (1 - GLOBAL.tMed));
        c = shade(spec[0], spec[1], u, curve(u), table.sun, table.shade, cond.desat);
      }
      out[i * 3] = Math.round(c[0]); out[i * 3 + 1] = Math.round(c[1]); out[i * 3 + 2] = Math.round(c[2]);
    }

    // 2. The sky, drawn rather than relit.
    const skySpec = table.sky;
    const tint = hex(skySpec[1]);
    const level = skySpec[0] * cond.skyLevel;
    const desat = cond.desat > 0 ? 0.62 * cond.desat : 0;
    const base = desat > 0 ? mix(tint, [lum(tint), lum(tint), lum(tint)], desat) : tint;
    if (passthrough) {
      // A clear night keeps the drawn sky, black and all - it is the reference every other frame
      // is tuned against, and the stars are painted into it.
      for (let i = 0; i < N; i++) {
        if (!sky[i]) continue;
        out[i * 3] = scene.scene.rgba[i * 4];
        out[i * 3 + 1] = scene.scene.rgba[i * 4 + 1];
        out[i * 3 + 2] = scene.scene.rgba[i * 4 + 2];
      }
    } else {
      const lowSun = ['dawn', 'dusk', 'golden'].includes(time);
      paintSky(out, W, H, sky, {
        zenith: atLuminance(base, level * 0.84),
        horizon: atLuminance(mix(base, hex(table.sun), 0.45), level * 1.14),
        cloudLight: atLuminance(mix(base, hex(table.sun), 0.55), Math.min(248, level * 1.34)),
        cloudDark: atLuminance(mix(base, hex(table.shade), 0.30), level * 0.80),
      }, {
        cloudAmount: cond.cloud,
        horizonRow,
        seed: 7,
        // Only shown when the sun is actually low enough to be in frame. Overhead it would sit
        // outside the crop, and under cloud there is nothing to see.
        sun: (lowSun && cond.cloud < 0.6)
          ? { x: 96, y: horizonRow - 22, colour: atLuminance(hex(table.sun), 244), radius: 30 }
          : null,
      });
    }

    // 3. Stars and the moon over the sky. Cloud removes them entirely.
    // Composited for every frame now, passthrough included: the base image no longer contains
    // them, so this is the only place they come from.
    const starAlpha = condName === 'overcast' ? 0 : (STARS[time] !== undefined ? STARS[time] : 1);
    if (starsImg && starAlpha > 0) {
      for (let i = 0; i < N; i++) {
        const a = (starsImg.rgba[i * 4 + 3] / 255) * starAlpha;
        if (a <= 0) continue;
        for (let k = 0; k < 3; k++) {
          out[i * 3 + k] = Math.round(out[i * 3 + k] * (1 - a) + starsImg.rgba[i * 4 + k] * a);
        }
      }
    }

    // 4. Atmospheric perspective: distance blends toward the sky, which is what distance does.
    //    Small, because the artwork already carries most of its own depth in the paint.
    const hazeStrength = passthrough ? 0 : 0.16;
    if (hazeStrength > 0) {
      const far = atLuminance(mix(base, hex(table.sun), 0.35), level * 1.02);
      for (let i = 0; i < N; i++) {
        if (sky[i]) continue;
        const k = (1 - depth[i]) * hazeStrength;
        if (k <= 0.004) continue;
        for (let c = 0; c < 3; c++) {
          out[i * 3 + c] = Math.round(out[i * 3 + c] * (1 - k) + far[c] * k);
        }
      }
    }

    // 5. Quantise the whole frame, with an ordered dither.
    //
    // The source artwork is indexed to exactly 40 colours. A relight that interpolates ramps
    // smoothly throws that away and produces a photographic image wearing pixel-art shapes - and
    // 2,300 colours per frame, which PNG cannot pack. Snapping to a coarse step and letting a
    // Bayer pattern carry the in-between restores the texture the artwork had and cuts the art
    // directory by a third. A clear night is exempt: it is the source, byte for byte.
    if (!passthrough) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const bias = BAYER8[(y & 7) * 8 + (x & 7)] / 64 - 0.5;
          for (let c = 0; c < 3; c++) {
            const v = Math.round(out[i * 3 + c] / QUANT + bias) * QUANT;
            out[i * 3 + c] = Math.max(0, Math.min(255, v));
          }
        }
      }
    }

    // ---- measurements
    const seen = {}, per = {};
    for (const m of LADDER) {
      const vals = [];
      for (let i = 0; i < N; i++) {
        if (MATERIALS[mat[i]] !== m) continue;
        vals.push(lum([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]));
      }
      if (!vals.length) continue;
      vals.sort((a, b) => a - b);
      seen[m] = Math.round(percentile(vals, 0.5));
      per[m] = iqr(vals);
    }
    achieved[time + '/' + condName] = seen;
    measured[time + '/' + condName] = per;

    fs.writeFileSync(path.join(OUT, time + '-' + condName + '.png'), encodePNG(out, W, H, 1));
  }
}

const nTimes = Object.keys(TIMES).length, nConds = Object.keys(CONDITIONS).length;
console.log('relit ' + (nTimes * nConds) + ' frames (' + nTimes + ' times x ' + nConds +
  ' conditions) at ' + W + 'x' + H + ' -> art/frames/');

if (report) {
  const cols = Object.keys(TIMES);
  for (const condName of Object.keys(CONDITIONS)) {
    console.log('\n' + condName + ' - achieved median luminance per material:\n');
    console.log('        ' + cols.map(t => t.slice(0, 7).padStart(8)).join(''));
    for (const m of LADDER) {
      console.log(m.padEnd(8) + cols.map(t => String(achieved[t + '/' + condName][m] ?? '-').padStart(8)).join(''));
    }
  }
}

if (contrast) {
  // Detail, as the interquartile range of each material's luminance. Compare every column against
  // `source`: far below it means the material is being flattened, far above it over-sharpened.
  const cols = Object.keys(TIMES);
  for (const condName of Object.keys(CONDITIONS)) {
    console.log('\n' + condName + ' - luminance IQR (detail); compare each column to source:\n');
    console.log('        ' + 'source'.padStart(8) + cols.map(t => t.slice(0, 7).padStart(8)).join(''));
    for (const m of LADDER) {
      if (!STATS[m] || !STATS[m].n) continue;
      console.log(m.padEnd(8) + STATS[m].iqr.toFixed(1).padStart(8) +
        cols.map(t => (measured[t + '/' + condName][m] ?? 0).toFixed(1).padStart(8)).join(''));
    }
  }
}

if (seams) {
  // The check this whole rewrite exists to pass.
  //
  // Walk down every column across the rows where the old plane bands used to meet. Wherever the
  // SOURCE is continuous, the output must be too - any step there is an edge the artwork does not
  // have. Reported as the worst ratio found; 1.00 is perfect.
  const BOUNDARIES = [71, 72, 178, 225, 226];
  console.log('\nseam check - largest edge where the source is flat, measured on 3x3 means:\n');
  console.log('frame                 levels  ratio  at          source      output');

  // Means either side, not single pixels. The output is deliberately dithered, so two adjacent
  // pixels can legitimately sit one quantisation step apart - comparing them directly measures
  // the dither and reports 12 levels of "seam" that nobody can see. Averaging a small block either
  // side is what the eye does, and it leaves only edges that are actually there.
  const meanAt = (img, x, y) => {
    let sum = 0, n = 0;
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const i = yy * W + xx;
        sum += img ? lum([img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]]) : srcL[i];
        n++;
      }
    }
    return n ? sum / n : 0;
  };

  for (const time of Object.keys(TIMES)) {
    for (const condName of Object.keys(CONDITIONS)) {
      const img = decodePNG(fs.readFileSync(path.join(OUT, time + '-' + condName + '.png')));
      let worst = 0, ratio = 1, where = '', sPair = '', oPair = '';
      for (const y of BOUNDARIES) {
        if (y < 4 || y >= H - 4) continue;
        for (let x = 1; x < W - 1; x++) {
          if (sky[y * W + x] || sky[(y - 3) * W + x]) continue;
          const sb = meanAt(null, x, y - 3), sa = meanAt(null, x, y);
          if (Math.abs(sa - sb) > 3) continue;           // the source itself has an edge here
          const ob = meanAt(img, x, y - 3), oa = meanAt(img, x, y);
          const delta = Math.abs(oa - ob);
          if (delta > worst) {
            worst = delta; ratio = (Math.max(oa, ob) + 4) / (Math.min(oa, ob) + 4);
            where = '(' + x + ',' + y + ')';
            sPair = sb.toFixed(0) + '->' + sa.toFixed(0);
            oPair = ob.toFixed(0) + '->' + oa.toFixed(0);
          }
        }
      }
      console.log((time + '/' + condName).padEnd(22) + worst.toFixed(1).padStart(5) +
        ratio.toFixed(2).padStart(7) + '  ' + where.padEnd(12) + sPair.padEnd(12) + oPair);
    }
  }
}
