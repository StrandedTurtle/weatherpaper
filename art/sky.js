'use strict';
// Paints the sky, because the artwork does not have one.
//
// The source is a night scene and its visible sky is essentially pure black - median luminance
// 0.0, interquartile range 12.5 across 9,100 pixels. There is nothing up there to relight. Every
// daylight sky the wallpaper has shown so far was invented by stretching that black, which is why
// it never looked like weather.
//
// So it is drawn instead: a dithered vertical gradient, cloud from value noise, and a horizon
// glow. Colour policy stays in relight.js - this file is handed four colours and only decides
// where they go, so there is one place to tune a time of day rather than two.
//
// Everything is a pure function of position and seed: same frame in, same frame out.

/** Ordered dither. Keeps the gradient reading as pixel art rather than as a photographic ramp. */
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

function hash2(x, y, seed) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Value noise: hashed lattice, smoothly interpolated. */
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

/** Three octaves is enough at 160 px wide; more just adds noise below the pixel grid. */
function fbm(x, y, seed) {
  return noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 17) * 0.30 +
    noise(x * 4.3, y * 4.3, seed + 31) * 0.15;
}

/** Channel quantisation step. Coarse enough to read as paint, fine enough not to posterise. */
const STEP = 13;

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function clamp8(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/**
 * Paint the sky into an RGB buffer, wherever `mask` says sky.
 *
 * @param colours {zenith, horizon, cloudLight, cloudDark} - each [r,g,b]
 * @param opts.cloudAmount 0 none, 1 a solid lid
 * @param opts.horizonRow  the lowest row any sky reaches; the gradient runs to it
 * @param opts.sun         {x, y, colour, radius} or null
 */
function paintSky(out, W, H, mask, colours, opts) {
  const { zenith, horizon, cloudLight, cloudDark } = colours;
  const amount = Math.max(0, Math.min(1, opts.cloudAmount));
  const seed = opts.seed | 0;
  const hRow = Math.max(8, opts.horizonRow || Math.round(H * 0.55));

  for (let y = 0; y < H; y++) {
    // Squared, so the light gathers near the horizon the way it actually does instead of ramping
    // evenly from the top of the frame.
    const f = Math.min(1, Math.max(0, y / hRow));
    const grad = f * f * 0.65 + f * 0.35;

    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;

      let c = mix(zenith, horizon, grad);

      if (amount > 0.002) {
        // Cloud is stretched hard along x: weather moves sideways, and banded shapes read as sky
        // where round blobs read as decoration.
        const n = fbm(x / 26 + seed * 0.7, y / 13, seed);
        // Higher cloud sits higher in the frame. Without this the cover was uniform to the
        // horizon and looked like a wall rather than a ceiling.
        const lift = 1 - 0.35 * f;
        const cov = smooth(Math.max(0, Math.min(1, (n * lift - (0.62 - 0.48 * amount)) / 0.16)));
        if (cov > 0) {
          const shade = smooth(Math.max(0, Math.min(1, (n - 0.45) / 0.35)));
          c = mix(c, mix(cloudDark, cloudLight, shade), cov * (0.35 + 0.65 * amount));
        }
      }

      // The sun, as a soft bloom rather than a disc. A hard disc at this scale is a bright dot
      // with a hard edge, which reads as a bug.
      if (opts.sun) {
        const dx = (x - opts.sun.x) / opts.sun.radius, dy = (y - opts.sun.y) / opts.sun.radius;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) {
          const k = smooth(1 - d);
          c = mix(c, opts.sun.colour, k * k * 0.85);
        }
      }

      // Quantise to a coarse step with an ordered dither, rather than writing the smooth value.
      //
      // Two reasons, and they agree. A continuous gradient is the wrong texture next to artwork
      // that is itself indexed to 40 colours - it reads as a photograph pasted behind pixel art.
      // And a smooth gradient plus a fine dither is high-frequency noise across a third of every
      // frame, which PNG cannot compress: it put 336 KB on the art directory. Snapping to a step
      // and letting the dither carry the in-between costs nothing and looks more like the rest of
      // the picture.
      const bias = BAYER8[(y & 7) * 8 + (x & 7)] / 64 - 0.5;
      out[i * 3] = clamp8(Math.round(c[0] / STEP + bias) * STEP);
      out[i * 3 + 1] = clamp8(Math.round(c[1] / STEP + bias) * STEP);
      out[i * 3 + 2] = clamp8(Math.round(c[2] / STEP + bias) * STEP);
    }
  }
}

module.exports = { paintSky };
