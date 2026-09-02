(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./render.js'));
  else root.WeatherPaperScene = factory(root.WeatherPaper);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const hex = R.hex, mix = R.mix, mul = R.mul, clamp = R.clamp, smooth = R.smooth;
  const rampAt = R.rampAt, resample = R.resample, BAYER = R.BAYER;

  const NIGHT_TINT = [0.40, 0.48, 0.70];
  const GOLDEN_TINT = [1.26, 1.00, 0.70];
  const DAY_TINT = [1.00, 1.00, 1.00];
  const RAMP_STOPS = 5;

  /**
   * Derives everything the draw passes need from the weather state. This is the one place
   * that turns "what the weather is" into "what colour things are", so the whole scene stays
   * consistent and there is a single thing to port to Kotlin.
   */
  function buildContext(spec, st, w, h) {
    const alt = R.sunAltitude(st.hour, st.sunrise, st.sunset);
    const dayLen = st.sunset - st.sunrise;
    const isDay = st.hour >= st.sunrise && st.hour <= st.sunset;
    const rising = isDay ? st.hour < st.sunrise + dayLen / 2 : st.hour > st.sunset;

    // Blend night -> twilight -> day ramps continuously by sun altitude.
    const night = resample(spec.skyRamps.night.map(hex), RAMP_STOPS);
    const day = resample(spec.skyRamps.day.map(hex), RAMP_STOPS);
    const twi = resample((rising ? spec.skyRamps.dawn : spec.skyRamps.dusk).map(hex), RAMP_STOPS);

    let stops = [];
    for (let i = 0; i < RAMP_STOPS; i++) {
      const toTwi = smooth(-0.32, -0.02, alt);
      const toDay = smooth(0.02, 0.34, alt);
      stops.push(mix(mix(night[i], twi[i], toTwi), day[i], toDay));
    }

    // Cloud cover pulls the sky toward flat grey and drops its brightness.
    const cloud = clamp(st.cloud || 0, 0, 1);
    if (cloud > 0) {
      const overcast = 0.75 * cloud;
      stops = stops.map(function (c) {
        const l = (c[0] + c[1] + c[2]) / 3;
        return mul(mix(c, [l, l, l * 1.04], overcast), [1 - 0.22 * cloud, 1 - 0.20 * cloud, 1 - 0.16 * cloud]);
      });
    }

    // Foliage tint: the 8-entry lookup that makes greens go blue-black at night and warm at
    // golden hour. Recomputed only when the state changes, never per pixel.
    let tint = alt <= 0
      ? mix(NIGHT_TINT, GOLDEN_TINT, smooth(-0.35, 0.0, alt))
      : mix(GOLDEN_TINT, DAY_TINT, smooth(0.02, 0.30, alt));
    if (cloud > 0) {
      const l = (tint[0] + tint[1] + tint[2]) / 3;
      tint = mul(mix(tint, [l, l, l], 0.55 * cloud), [1 - 0.18 * cloud, 1 - 0.16 * cloud, 1 - 0.12 * cloud]);
    }

    const season = spec.seasons[st.season] || spec.seasons.summer;
    const horizonY = Math.round(h * spec.layout.horizon);

    // Sun/moon travel an arc across the sky; light direction follows it, so trees are lit
    // from wherever the sun actually is.
    const nightLen = 24 - dayLen;
    const since = st.hour > st.sunset ? st.hour - st.sunset : st.hour + 24 - st.sunset;
    const f = isDay ? (st.hour - st.sunrise) / dayLen : since / nightLen;
    const bodyX = w * (0.12 + 0.76 * f);
    const bodyY = horizonY - horizonY * (isDay ? 0.82 : 0.68) * Math.sin(Math.PI * f);

    return {
      alt: alt, isDay: isDay, cloud: cloud, skyStops: stops, horizonY: horizonY,
      haze: rampAt(stops, 1), tint: tint, season: season,
      canopyPal: spec.palette.canopy.map(hex),
      trunkPal: spec.palette.trunk.map(hex),
      groundPal: spec.palette.ground.map(hex),
      accent: (function (a) { const o = {}; for (const k in a) o[k] = hex(a[k]); return o; })(spec.palette.accent),
      seasonAccent: season.accent ? hex(season.accent) : null,
      bodyX: bodyX, bodyY: bodyY, bodyF: f,
      lightDir: bodyX > w / 2 ? 1 : -1,
      nightness: clamp(smooth(0.10, -0.25, alt), 0, 1),
    };
  }

  /** Resolve a canopy shade index at a given depth into a final colour. */
  function canopyColour(ctx, idx, depth) {
    let c = ctx.canopyPal[clamp(Math.round(idx), 0, ctx.canopyPal.length - 1)];
    c = mul(c, ctx.season.tint);
    c = mul(c, ctx.tint);
    c = mul(c, [0.32 + 0.68 * depth, 0.32 + 0.68 * depth, 0.32 + 0.68 * depth]);
    // Atmospheric perspective: distant foliage drifts toward the horizon haze.
    return mix(c, ctx.haze, Math.pow(depth, 1.3) * 0.55);
  }

  function trunkColour(ctx, idx, depth) {
    let c = ctx.trunkPal[clamp(Math.round(idx), 0, ctx.trunkPal.length - 1)];
    c = mul(c, ctx.tint);
    c = mul(c, [0.34 + 0.66 * depth, 0.34 + 0.66 * depth, 0.34 + 0.66 * depth]);
    return mix(c, ctx.haze, Math.pow(depth, 1.3) * 0.55);
  }

  // ------------------------------------------------------------------- sky
  function drawSky(f, spec, ctx) {
    const step = spec.ditherStep, hy = ctx.horizonY;
    for (let y = 0; y < f.h; y++) {
      const c = rampAt(ctx.skyStops, clamp(y / Math.max(1, hy - 1), 0, 1));
      const row = BAYER[y & 3];
      for (let x = 0; x < f.w; x++) {
        const b = (row[x & 3] / 16 - 0.5) * step;
        f.px(x, y, [
          Math.round((c[0] + b) / step) * step,
          Math.round((c[1] + b) / step) * step,
          Math.round((c[2] + b) / step) * step,
        ]);
      }
    }
  }

  function drawStars(f, spec, ctx, t) {
    if (ctx.nightness <= 0.02) return;
    const rand = R.rng(spec.seed ^ 0x51ed);
    const n = Math.round(f.w * ctx.horizonY / 900);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rand() * f.w);
      const y = Math.floor(rand() * ctx.horizonY * 0.92);
      const base = 0.35 + rand() * 0.65;
      const tw = 0.75 + 0.25 * Math.sin(t * 0.0022 + i * 2.4);
      f.blend(x, y, ctx.accent.star, base * tw * ctx.nightness * (1 - ctx.cloud * 0.9));
    }
  }

  function drawCelestial(f, spec, ctx, moonP) {
    const vis = 1 - ctx.cloud * 0.85;
    if (vis <= 0.05) return;
    const cx = Math.round(ctx.bodyX), cy = Math.round(ctx.bodyY);
    if (cy > ctx.horizonY + 4) return;

    const sun = ctx.isDay;
    const r = sun ? 5 : 6;
    const core = sun ? ctx.accent.sun : ctx.accent.moon;

    // Soft glow, dithered so it stays in keeping with the rest of the scene.
    const glowR = sun ? r * 4 : r * 2.6;
    for (let dy = -glowR; dy <= glowR; dy++) {
      for (let dx = -glowR; dx <= glowR; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r || d > glowR) continue;
        const a = Math.pow(1 - (d - r) / (glowR - r), 2.2) * (sun ? 0.5 : 0.3) * vis;
        const bd = BAYER[(cy + dy) & 3][(cx + dx) & 3] / 16;
        if (a > bd * 0.55) f.blend(cx + dx, cy + dy, core, a * 0.8);
      }
    }

    const theta = 2 * Math.PI * moonP, cosT = Math.cos(theta);
    for (let dy = -r; dy <= r; dy++) {
      const edge = Math.sqrt(Math.max(0, r * r - dy * dy));
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        if (!sun) {
          const dxx = moonP > 0.5 ? -dx : dx;
          if (dxx < cosT * edge) continue; // unlit side of the moon
        }
        f.blend(cx + dx, cy + dy, core, vis);
      }
    }
  }

  return {
    buildContext: buildContext,
    canopyColour: canopyColour,
    trunkColour: trunkColour,
    drawSky: drawSky,
    drawStars: drawStars,
    drawCelestial: drawCelestial,
  };
});
