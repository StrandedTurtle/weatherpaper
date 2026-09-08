'use strict';
// Relights the scene into one flattened image per time of day.
//
//   node art/relight.js            # writes art/frames/*.png
//   node art/relight.js --report   # and prints the depth ladder it actually achieved
//
// The artwork is drawn as a clear night. Rather than lifting it at runtime with a colour matrix
// - which flattens it, because a matrix cannot know that sky and foliage want to move in
// different directions - each depth plane is relit here, offline, and the result flattened to a
// single PNG per time.
//
// The thing that makes a forest read as deep is not hue, it is the LUMINANCE LADDER: sky
// brightest, then the far haze, then mid trunks, with the near trees and the overhanging canopy
// nearly black against all of it. Get that wrong and the foreground stops being a silhouette and
// starts looking like fog, which is exactly what the first attempt at this did.
//
// So a plane is not given a ramp directly. It is given a TARGET MEDIAN LUMINANCE - its rung on
// the ladder - plus a tint, and the ramp is built to hit that target: the plane's own median
// pixel is pinned to the middle stop, darker pixels run down toward the ambient shadow colour
// and lighter ones up toward the sun colour. The ladder is then legible as a column of numbers
// you can read down and check, instead of forty hex triples whose brightness you have to
// evaluate in your head.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('../tools/png.js');
const { decodePNG } = require('../tools/png-decode.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art/layers');
const OUT = path.join(ROOT, 'art/frames');

/** Which rung of the depth ladder each plane sits on. */
const CLASS_OF = {
  '01-sky': 'sky',
  '02-stars': 'stars',
  '03-far-haze': 'haze',
  '04-mid-forest': 'far',
  '05-ground': 'ground',
  '06-cabin': 'wood',
  '07-near-forest': 'near',
  '08-foreground': 'fore',
  '09-canopy': 'canopy',
};

/** Back to front. Also the order the ladder is reported in. */
const LADDER = ['sky', 'haze', 'far', 'ground', 'wood', 'near', 'fore', 'canopy'];

/**
 * How wide a ramp each material gets, as multiples of its target median.
 *
 * This is a property of the MATERIAL, not the hour, so it is stated once. It matters most for
 * the sky: the artwork is a night sky, near-black at the zenith and glowing at the horizon, and
 * remapping that structure faithfully gave a midday sky that was navy at the top. A sky is a
 * smooth field of light rather than a lit object, so it gets a narrow ramp - bright everywhere,
 * with just enough spread left for the painted clouds to read. Foliage and ground are lit
 * objects with real shadow, so they get a wide one - though the clearing floor is narrower than
 * it first looks: half its pixels sit above the median, and letting those climb to twice it
 * bleached the grass to a pale sage. Sunlit grass is bright, not white.
 */
const SPREAD = {
  sky: [0.82, 1.20], haze: [0.78, 1.30], far: [0.55, 1.58], ground: [0.46, 1.52],
  wood: [0.45, 1.70], near: [0.42, 1.80], fore: [0.40, 1.78], canopy: [0.40, 1.80],
};

/** How visible the stars-and-moon plane is at each time. */
const STARS = {
  night: 1, firstlight: 0.55, dawn: 0.18, morning: 0, midday: 0,
  golden: 0, dusk: 0.20, twilight: 0.62,
};

/**
 * Each entry is [target median luminance, tint]. Read the numbers down the column: they are the
 * depth ladder, and they must descend from sky to canopy or the scene loses its depth.
 *
 * `sun` is what highlights climb toward, `shade` what shadows fall toward - the two are what
 * make midday feel like midday (warm light, blue shadow) rather than a green picture turned up.
 *
 * Eight times, not six. The two blue hours - `firstlight` before sunrise and `twilight` after
 * sunset - exist because those were the longest gaps in the day and the fastest-changing light
 * in it: cross-fading straight from sunset to midnight spent five hours interpolating across the
 * one part of the cycle that actually moves quickly. Having them also frees `dawn` and `dusk` to
 * BE sunrise and sunset - warm, bright, brief - instead of doubling as the dim end of the day,
 * which is why they used to read as little more than night with a coloured sky.
 */
const TIMES = {
  night: {
    // A CLEAR night is passed through untouched - it is the artwork exactly as drawn, and the
    // reference every other frame is tuned against. The table below is only reached when cloud
    // covers it: an overcast night has no moon and no stars, so it cannot be the same picture.
    passthroughWhenClear: true,
    sun: '#8898B8', shade: '#0A0E18',
    sky: [40, '#3A4258'], haze: [48, '#454C60'], far: [34, '#2A3440'], ground: [66, '#3A4A3E'],
    wood: [28, '#33303A'], near: [22, '#1C2430'], fore: [26, '#1A1E26'], canopy: [25, '#1E2630'],
  },
  firstlight: {
    // The cold blue hour before sunrise. No warmth anywhere yet - that is what makes it read as
    // before rather than after, since dusk's twin at the same level is warm.
    sun: '#B8C4E0', shade: '#101628',
    sky: [56, '#5A6890'], haze: [44, '#5A6480'], far: [30, '#33455A'], ground: [52, '#364A48'],
    wood: [26, '#3E4048'], near: [16, '#20293A'], fore: [12, '#161A24'], canopy: [13, '#1A222C'],
  },
  dawn: {
    // Sunrise proper: a warm rim on a still-cool sky.
    sun: '#FFC0A0', shade: '#1A2038',
    sky: [104, '#8C86AC'], haze: [82, '#9A8898'], far: [50, '#465866'], ground: [76, '#4E6250'],
    wood: [46, '#6A5A58'], near: [24, '#2A384A'], fore: [16, '#1C222C'], canopy: [19, '#202C36'],
  },
  morning: {
    // Softer and hazier than noon: the haze sits higher against the far trees, contrast lower.
    sun: '#FFF4E4', shade: '#2C4258',
    sky: [150, '#93BEDA'], haze: [116, '#A6C0BC'], far: [56, '#4A7C5E'], ground: [90, '#63945E'],
    wood: [64, '#8A7860'], near: [27, '#33604A'], fore: [16, '#223E2E'], canopy: [20, '#2C4E38'],
  },
  midday: {
    // The strongest light of the day: deepest sky, greenest ground, hardest silhouettes.
    sun: '#FFF9E2', shade: '#20364E',
    sky: [172, '#74AEE0'], haze: [110, '#8EB4B4'], far: [62, '#4C8656'], ground: [108, '#71A65C'],
    wood: [78, '#977C5A'], near: [30, '#356A46'], fore: [16, '#22402A'], canopy: [21, '#2E5634'],
  },
  golden: {
    // Only what the low sun actually reaches goes warm. Making every class orange turned the
    // whole picture into one sepia wash, so the near trees and canopy stay green here - they are
    // in their own shadow - and the warmth is carried by the sky, the clearing and the cabin.
    sun: '#FFCE8A', shade: '#2A2E44',
    sky: [148, '#C2A8B0'], haze: [110, '#CCAE9A'], far: [56, '#5E7A4C'], ground: [92, '#8A9450'],
    wood: [80, '#A88254'], near: [26, '#3C5434'], fore: [14, '#242C1E'], canopy: [19, '#32421F'],
  },
  dusk: {
    // Sunset proper: red-orange in the west, and warmer than dawn at the same level so the two
    // ends of the day never look like each other.
    sun: '#FF9A70', shade: '#181630',
    sky: [96, '#B0788A'], haze: [76, '#9C7080'], far: [44, '#4E4A5C'], ground: [70, '#54544E'],
    wood: [44, '#6E4E4E'], near: [22, '#30303C'], fore: [15, '#1E1C24'], canopy: [18, '#242630'],
  },
  twilight: {
    // The blue hour after sunset: dim, but with the last of the west still in it.
    sun: '#C88C80', shade: '#12132A',
    sky: [50, '#6A6088'], haze: [40, '#605A78'], far: [26, '#3A3E50'], ground: [44, '#38423E'],
    wood: [24, '#443A42'], near: [14, '#242631'], fore: [10, '#181820'], canopy: [12, '#1E2028'],
  },
};

/**
 * Sky conditions, as modifiers on the time tables rather than tables of their own.
 *
 * Overcast is not a clear scene with the colour turned down, which is all a runtime saturation
 * matrix can make it. Under cloud the sky becomes a flat bright lid, and - the part that actually
 * sells it - every shadow in the scene disappears, because the light source stops being a point
 * and becomes the whole sky. So the real change is to RAMP WIDTH: `spread` compresses every
 * material's ramp toward its median, which is what "no shadows, no highlights" means numerically.
 *
 * `level` then drops the sun-lit surfaces more than the shaded ones, because they are the ones
 * that lose something; `haze` lifts the distance toward the sky, since more water in the air is
 * what a cloudy day is; and `desat` pulls the tints toward their own grey.
 */
const CONDITIONS = {
  clear: { spread: 1, desat: 0, haze: 0, level: {}, spreadFor: {}, desatFor: {} },
  overcast: {
    spread: 0.55, desat: 0.50, haze: 0.30,
    // An overcast day is BRIGHT and flat, not dim. The first attempt cut every level and came
    // out as a murky dusk, because compressing the ramp already removes the highlights - cutting
    // the median as well takes the light away twice. So the levels here mostly hold, and the
    // shaded classes go UP: with the whole sky as the source, light reaches under and behind
    // things that had nothing but shadow before. Filling in is what a cloudy day does.
    level: {
      sky: 0.95, haze: 1.04, far: 1.06, ground: 1.10,
      wood: 1.04, near: 1.16, fore: 1.22, canopy: 1.16,
    },
    // The sky needs crushing far harder than anything else. Compressed only as much as the
    // foliage, the painted cloud shapes survived and it still read as a blue sky with white
    // clouds on it - which is a PARTLY cloudy day, not an overcast one. Overcast is the state
    // where the clouds have merged into one lid and there is nothing left to see up there, so
    // its contrast goes almost entirely and its colour goes almost entirely with it.
    spreadFor: { sky: 0.13, haze: 0.25 },
    desatFor: { sky: 0.80, haze: 0.68 },
  },
};

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
 * Build the three stops for one class: its median pinned to the middle, shadows falling toward
 * the ambient shade colour and highlights climbing toward the sun.
 */
function stopsFor(cls, spec, sun, shade, cond) {
  const [dm0, lm0] = SPREAD[cls] || [0.45, 1.9];
  // Compress the ramp toward the median. This is the whole of "overcast": a diffuse sky lights
  // every face of everything about equally, so shadow and highlight both collapse toward the
  // midtone. Turning the saturation down instead only ever made a clear day look ill.
  const sp = cond.spreadFor[cls] !== undefined ? cond.spreadFor[cls] : cond.spread;
  const dm = 1 - (1 - dm0) * sp;
  const lm = 1 + (lm0 - 1) * sp;

  let target = spec[0] * (cond.level[cls] !== undefined ? cond.level[cls] : 1);
  let tint = hex(spec[1]);
  const ds = cond.desatFor[cls] !== undefined ? cond.desatFor[cls] : cond.desat;
  if (ds > 0) {
    const g = lum(tint);
    tint = mix(tint, [g, g, g], ds);
  }
  // Distance washes out under cloud: the far planes drift toward the sky's own level.
  if (cond.haze > 0 && (cls === 'haze' || cls === 'far')) {
    const skyTarget = spec[0];                       // only used for its own class below
    target = target + (SKY_LEVEL.value - target) * cond.haze * (cls === 'haze' ? 0.55 : 0.30);
  }

  const shadeMix = Math.min(0.45, 0.45 * (1 - dm));
  const sunMix = Math.min(0.42, 0.42 * (lm - 1) / 0.9);
  // Tint first, THEN set the brightness. Mixing a stop toward the sun colour after scaling it
  // also drags its luminance up toward the sun's: blending 40% of a near-white into a canopy
  // highlight meant for luminance 39 landed it at 123, which is why foliage came out grey and
  // dusty in daylight rather than dark green. Warm light and cool shade are a change of hue at a
  // given brightness, not a change of brightness.
  const mid = atLuminance(tint, target);
  const dark = atLuminance(mix(tint, hex(shade), shadeMix), target * dm);
  const light = atLuminance(mix(tint, hex(sun), sunMix), Math.min(250, target * lm));
  return [dark, mid, light];
}

/** The sky's target for the frame being generated, so haze can be pulled toward it. */
const SKY_LEVEL = { value: 120 };

/** Sample a 3-stop ramp at u in 0..1. */
function ramp(stops, u) {
  return u <= 0.5 ? mix(stops[0], stops[1], u / 0.5) : mix(stops[1], stops[2], (u - 0.5) / 0.5);
}

/**
 * At daylit times the sky and haze planes are passed through a 3x3 median filter first.
 *
 * Those planes are a NIGHT sky: stars painted directly into them, plus the fine dither of a dark
 * gradient. Both are isolated single pixels far from their neighbours - salt-and-pepper noise, in
 * other words - and a median filter is what removes that, exactly and without touching anything
 * else. An outlier-and-average test was tried first and let stars through, because a star two
 * pixels across drags its own local average up and hides in it; a median cannot be fooled that
 * way, since a lone bright pixel is never the middle of its own neighbourhood.
 *
 * Cloud edges survive because a median preserves edges by construction - it only ever returns a
 * value one of the neighbours already had. And a daylit sky wants to be smooth anyway: the fine
 * texture that reads as depth at night reads as dirt at noon.
 */
function smoothSky(img, W, H, passes) {
  let cur = new Float32Array(W * H);
  const opaque = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    opaque[i] = img.rgba[i * 4 + 3] >= 128 ? 1 : 0;
    cur[i] = lum([img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]]);
  }
  const win = [];
  for (let pass = 0; pass < (passes || 2); pass++) {
    const out = new Float32Array(cur);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!opaque[i]) continue;
        win.length = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * W + dx;
            // Transparent neighbours are not black, they are absent; counting them as 0 would
            // drag the edge of a sparse plane down into shadow.
            if (opaque[j]) win.push(cur[j]);
          }
        }
        if (win.length < 5) continue;
        win.sort((a, b) => a - b);
        out[i] = win[win.length >> 1];
      }
    }
    cur = out;
  }
  return cur;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).sort();
const planes = files.map(f => {
  const name = f.replace(/\.png$/, '');
  const img = decodePNG(fs.readFileSync(path.join(SRC, f)));
  const cls = CLASS_OF[name] || 'near';
  const dayLum = (cls === 'sky' || cls === 'haze') ? smoothSky(img, img.width, img.height, 2) : null;

  // Bounds come from percentiles, not min/max. One stray bright pixel - and the mid-forest plane
  // has one, at luminance 189 against a 95th percentile of 68 - would otherwise set the ceiling
  // and squash the entire plane into the bottom third of its ramp.
  const vals = [];
  for (let i = 0; i < img.width * img.height; i++) {
    if (img.rgba[i * 4 + 3] < 128) continue;
    vals.push(lum([img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]]));
  }
  vals.sort((a, b) => a - b);
  const lo = percentile(vals, 0.02);
  const hi = Math.max(percentile(vals, 0.98), lo + 1);
  const med = percentile(vals, 0.5);
  return {
    name, cls, img, lo, hi, dayLum,
    // Where the median sits in 0..1, so it can be pinned to the ramp's middle stop.
    tMed: Math.min(0.92, Math.max(0.08, (med - lo) / (hi - lo))),
  };
});

const W = planes[0].img.width, H = planes[0].img.height;
fs.mkdirSync(OUT, { recursive: true });
const report = process.argv.includes('--report');
const achieved = {};

for (const [time, table] of Object.entries(TIMES)) {
  for (const [condName, cond] of Object.entries(CONDITIONS)) {
    // Cloud cannot hide stars that were never drawn as a separate plane, so a clear night is the
    // only frame that passes through untouched.
    const passthrough = condName === 'clear' && table && table.passthroughWhenClear;
    const out = new Uint8Array(W * H * 3);
    const seen = {};
    SKY_LEVEL.value = table ? table.sky[0] : 120;

    for (const p of planes) {
      const spec = table ? table[p.cls] : null;
      let starAlpha = p.cls === 'stars' ? (STARS[time] !== undefined ? STARS[time] : 1) : 1;
      // Overcast means no sky at all: the moon and stars go completely.
      if (p.cls === 'stars' && condName === 'overcast') starAlpha = 0;
      if (starAlpha <= 0) continue;
      const stops = (spec && !passthrough) ? stopsFor(p.cls, spec, table.sun, table.shade, cond) : null;
      const daylit = STARS[time] === 0 || condName === 'overcast';
      const lums = [];

      for (let i = 0; i < W * H; i++) {
        const a = (p.img.rgba[i * 4 + 3] / 255) * starAlpha;
        if (a <= 0) continue;
        const r = p.img.rgba[i * 4], g = p.img.rgba[i * 4 + 1], b = p.img.rgba[i * 4 + 2];
        let c;
        if (!stops) {
          c = [r, g, b];                                        // clear night: exactly as drawn
        } else {
          const L = (p.dayLum && daylit) ? p.dayLum[i] : lum([r, g, b]);
          const t = Math.min(1, Math.max(0, (L - p.lo) / (p.hi - p.lo)));
          // Pin the median to the middle stop, so the plane lands on its rung of the ladder
          // whatever shape its own histogram happens to be.
          const u = t <= p.tMed ? 0.5 * (t / p.tMed) : 0.5 + 0.5 * ((t - p.tMed) / (1 - p.tMed));
          c = ramp(stops, u);
        }
        if (report && a > 0.9) lums.push(lum(c));
        for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(out[i * 3 + k] * (1 - a) + c[k] * a);
      }
      if (report && lums.length) {
        lums.sort((x, y) => x - y);
        seen[p.cls] = Math.round(percentile(lums, 0.5));
      }
    }
    achieved[time + '/' + condName] = seen;
    fs.writeFileSync(path.join(OUT, time + '-' + condName + '.png'), encodePNG(out, W, H, 1));
  }
}

const nTimes = Object.keys(TIMES).length, nConds = Object.keys(CONDITIONS).length;
console.log('relit ' + (nTimes * nConds) + ' frames (' + nTimes + ' times x ' + nConds +
  ' conditions) at ' + W + 'x' + H + ' -> art/frames/');
if (report) {
  for (const condName of Object.keys(CONDITIONS)) {
    const cols = Object.keys(TIMES);
    console.log('\n' + condName + ' - achieved median luminance (must descend down each column):\n');
    console.log('        ' + cols.map(t => t.slice(0, 7).padStart(8)).join(''));
    for (const cls of LADDER) {
      console.log(cls.padEnd(8) + cols.map(t =>
        String(achieved[t + '/' + condName][cls] ?? '-').padStart(8)).join(''));
    }
  }
}
