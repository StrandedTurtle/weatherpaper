(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./render.js'), require('./scene.js'));
  else root.WeatherPaperWx = factory(root.WeatherPaper, root.WeatherPaperScene);
})(typeof self !== 'undefined' ? self : this, function (R, S) {
  'use strict';

  const mix = R.mix, mul = R.mul, clamp = R.clamp, BAYER = R.BAYER;

  function drawCloud(f, spec, ctx, cx, cy, scale, seed) {
    const rand = R.rng(seed);
    const lobes = 3 + Math.floor(rand() * 3);
    const parts = [];
    let maxR = 0;
    for (let i = 0; i < lobes; i++) {
      const rx = (7 + rand() * 11) * scale;
      const ry = rx * (0.42 + rand() * 0.22);
      const ox = (i - (lobes - 1) / 2) * rx * 0.85 + (rand() - 0.5) * 4;
      const oy = (rand() - 0.5) * 3 * scale;
      parts.push([ox, oy, rx, ry]);
      maxR = Math.max(maxR, Math.abs(ox) + rx);
    }
    const lightTop = mix(ctx.haze, [255, 255, 255], 0.30 - 0.22 * ctx.cloud);
    const darkBase = mix(ctx.haze, [0, 0, 0], 0.18 + 0.16 * ctx.cloud);
    const alpha = 0.55 + 0.40 * ctx.cloud;

    for (let dy = -14 * scale; dy <= 14 * scale; dy++) {
      for (let dx = -maxR - 2; dx <= maxR + 2; dx++) {
        let inside = false, topness = 0;
        for (let i = 0; i < parts.length && !inside; i++) {
          const p = parts[i];
          const nx = (dx - p[0]) / p[2], ny = (dy - p[1]) / p[3];
          if (nx * nx + ny * ny <= 1) { inside = true; topness = clamp(-ny * 0.5 + 0.5, 0, 1); }
        }
        if (!inside) continue;
        const c = mix(darkBase, lightTop, Math.pow(topness, 1.4));
        const b = BAYER[(cy + dy) & 3][((cx + dx) | 0) & 3] / 16;
        f.blend(cx + dx, cy + dy, c, alpha * (0.75 + 0.25 * b));
      }
    }
  }

  function drawClouds(f, spec, ctx, st, t) {
    if (ctx.cloud < 0.08) return;
    const n = Math.round(1 + ctx.cloud * 7);
    const rand = R.rng(spec.seed ^ 0xc10d);
    for (let i = 0; i < n; i++) {
      const base = rand();
      const y = Math.round(ctx.horizonY * (0.08 + rand() * 0.50));
      const scale = 0.55 + rand() * 0.95;
      const speed = (0.6 + rand() * 0.7) * (0.25 + (st.wind || 0) * 1.9);
      let u = (base + (t / 1000) * speed * 0.012) % 1.4;
      if (u < 0) u += 1.4;
      drawCloud(f, spec, ctx, Math.round((u - 0.2) * f.w), y, scale, spec.seed + i * 131);
    }
  }

  /** Rain, drizzle and snow. Particle positions are a pure function of index and time. */
  function drawPrecip(f, spec, ctx, st, t) {
    const cfg = spec.precip[st.precip];
    if (!cfg) return;
    const snow = st.precip === 'snow';
    const wind = (st.wind || 0);
    const rand = R.rng(spec.seed ^ 0x9a1f);
    const colour = snow ? ctx.accent.snow : ctx.accent.rain;
    const tint = mul(colour, ctx.tint);

    for (let i = 0; i < cfg.count; i++) {
      const px = rand(), py = rand(), vr = 0.75 + rand() * 0.5;
      const fall = cfg.speed * vr * (snow ? 14 : 62);
      const drift = snow
        ? Math.sin(t / 900 + i) * 5 + wind * 34 * (t / 1000) * 0.35
        : wind * fall * 0.55;

      let y = (py * f.h + (t / 1000) * fall) % f.h;
      let x = (px * f.w + (snow ? drift : (t / 1000) * drift)) % f.w;
      if (x < 0) x += f.w;

      if (snow) {
        f.blend(Math.round(x), Math.round(y), tint, cfg.alpha * (0.5 + 0.5 * vr));
      } else {
        const slant = wind * 2.2;
        for (let k = 0; k < cfg.length; k++) {
          f.blend(Math.round(x - k * slant), Math.round(y - k), tint, cfg.alpha * (1 - k / (cfg.length + 1)));
        }
      }
    }
  }

  /** Fog: dithered horizontal bands that thicken toward the ground and drift with the wind. */
  function drawFog(f, spec, ctx, st, t, amount) {
    if (amount <= 0.02) return;
    const colour = mul(ctx.accent.fog, ctx.tint);
    const drift = (t / 1000) * (0.3 + (st.wind || 0) * 2.2) * 6;
    for (let y = Math.round(ctx.horizonY * 0.72); y < f.h; y++) {
      const depth = clamp((y - ctx.horizonY * 0.72) / (f.h - ctx.horizonY * 0.72), 0, 1);
      const band = 0.5 + 0.5 * Math.sin(y * 0.09 + t / 2600);
      const a = amount * (0.12 + 0.55 * Math.pow(depth, 0.7)) * (0.65 + 0.35 * band);
      for (let x = 0; x < f.w; x++) {
        const b = BAYER[y & 3][(x + Math.round(drift)) & 3] / 16;
        if (a > b * 0.55) f.blend(x, y, colour, a * 0.85);
      }
    }
  }

  /** Occasional full-scene flash during thunderstorms. */
  function lightningAlpha(t, seed) {
    const period = 4200;
    const idx = Math.floor(t / period);
    const rand = R.rng((seed ^ idx) | 0);
    if (rand() > 0.45) return 0;
    const local = t - idx * period - rand() * 400;
    if (local < 0 || local > 320) return 0;
    const strikes = [0, 60, 90, 200, 240];
    let a = 0;
    for (let i = 0; i < strikes.length; i++) {
      const d = local - strikes[i];
      if (d >= 0 && d < 55) a = Math.max(a, (1 - d / 55) * (i % 2 === 0 ? 1 : 0.55));
    }
    return a * 0.72;
  }

  function drawLightning(f, ctx, a) {
    if (a <= 0.01) return;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        f.blend(x, y, ctx.accent.lightning, a * 0.55);
      }
    }
  }

  return {
    drawClouds: drawClouds, drawPrecip: drawPrecip, drawFog: drawFog,
    lightningAlpha: lightningAlpha, drawLightning: drawLightning,
  };
});
