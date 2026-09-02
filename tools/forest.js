(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./render.js'), require('./scene.js'));
  else root.WeatherPaperForest = factory(root.WeatherPaper, root.WeatherPaperScene);
})(typeof self !== 'undefined' ? self : this, function (R, S) {
  'use strict';

  const mix = R.mix, mul = R.mul, clamp = R.clamp, BAYER = R.BAYER;

  /** Stable spatial hash - lets patches be generated on the fly with no noise texture stored. */
  function hash2(x, y, seed) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  /** Blocky value noise. Two cell sizes so patches have irregular edges instead of grid squares. */
  function patchNoise(x, y, seed) {
    return hash2(Math.floor(x / 4), Math.floor(y / 4), seed) * 0.62
         + hash2(Math.floor(x / 2), Math.floor(y / 2), seed + 7) * 0.38;
  }

  /**
   * One pine, drawn as a stack of flaring tiers. Each tier resets to a narrow width and flares
   * out toward its base, which is what gives the notched pine silhouette rather than a cone.
   *
   * Variety comes from tier count, a width exponent (spires vs. broad firs) and a slight lean,
   * so a forest built from one function still reads as many different trees.
   */
  function drawPine(f, spec, ctx, cx, baseY, h, w, depth, seed) {
    const rand = R.rng(seed);
    const halfW = w / 2;
    const snowAmt = ctx.season.snow;
    const accent = ctx.seasonAccent;
    // Detail falls away toward the viewer: the framing trees read as silhouette, so they
    // carry far less season colour than the mid-ground does.
    const accentChance = (ctx.season.accentChance || 0) * (0.30 + 0.70 * depth);
    const depthMul = [0.32 + 0.68 * depth, 0.32 + 0.68 * depth, 0.32 + 0.68 * depth];

    const tiers = 3 + Math.floor(rand() * 5);
    const spire = 0.52 + rand() * 0.34;      // low = broad fir, high = narrow spire
    const flare = 0.62 + rand() * 0.30;
    const lean = (rand() - 0.5) * w * 0.14;
    const trunkH = Math.max(2, Math.round(h * 0.13));

    // Trunk first, so the lowest canopy tier overlaps and the tree does not look stilted.
    if (h > 14) {
      const tw = Math.max(1, Math.round(w * 0.10));
      for (let y = Math.round(baseY - trunkH); y < Math.round(baseY); y++) {
        for (let i = 0; i < tw; i++) {
          f.px(Math.round(cx - tw / 2 + i), y, S.trunkColour(ctx, i === 0 ? 0 : (i < tw - 1 ? 2 : 1), depth));
        }
      }
    }

    const canopyH = Math.max(4, h - trunkH * 0.45);
    const topY = baseY - h;
    const tierH = canopyH / tiers;

    for (let ti = 0; ti < tiers; ti++) {
      const y0 = topY + ti * tierH;
      const tierMax = halfW * Math.pow((ti + 1) / tiers, spire);
      const tierMin = tierMax * (1 - flare);

      for (let y = Math.round(y0); y < Math.round(y0 + tierH); y++) {
        const local = clamp((y - y0) / tierH, 0, 1);
        const leanX = lean * ((y - topY) / Math.max(1, canopyH) - 0.5) * 2;
        let hw = tierMin + (tierMax - tierMin) * Math.pow(local, 0.72);
        hw += (rand() - 0.5) * Math.max(1, w * 0.08);
        hw = Math.max(0.5, hw);
        const hwi = Math.round(hw);
        const cxx = cx + leanX;

        for (let dx = -hwi; dx <= hwi; dx++) {
          const x = Math.round(cxx + dx);
          const rel = dx / hw;
          const lit = rel * ctx.lightDir;

          let shade = 4;
          if (lit > 0.30) shade += 1;
          if (lit > 0.68) shade += 1;
          if (lit < -0.30) shade -= 1;
          if (lit < -0.72) shade -= 1;
          if (local > 0.82) shade -= 1;                    // shadow beneath each branch tier
          const n = hash2(x, y, spec.seed + ti);
          if (n < 0.10) shade += 1; else if (n > 0.92) shade -= 1;

          let c = S.canopyColour(ctx, shade, depth);

          // Autumn/spring colour comes in as patches, not per-pixel speckle.
          if (accent && accentChance > 0 && patchNoise(x, y, spec.seed + 77) < accentChance) {
            const tinted = mul(mul(accent, ctx.tint), depthMul);
            c = mix(c, tinted, 0.55 + hash2(x, y, spec.seed + 3) * 0.35);
          }
          // Snow lies solidly on the upper face of each tier, thinning as it goes down.
          if (snowAmt > 0) {
            const lying = local < 0.10 || (local < 0.32 && patchNoise(x, y, spec.seed + 5) < snowAmt);
            if (lying) c = mix(c, mul(mul(ctx.accent.snow, ctx.tint), depthMul), 0.55 + 0.35 * snowAmt);
          }
          f.px(x, y, c);
        }
      }
    }
  }

  function drawLayer(f, spec, ctx, layer, xOffset) {
    const rand = R.rng(spec.seed ^ Math.imul(layer.name.length + 3, 2654435761));
    const baseY = f.h * layer.baseY;
    const margin = Math.round(f.w * 0.3);
    const edges = layer.edgesOnly || 0;
    const wr = layer.widthRatio || [0.42, 0.58];
    let i = 0;

    for (let x = -margin; x < f.w + margin; x += layer.spacing) {
      i++;
      const jitter = (rand() - 0.5) * layer.spacing * 0.85;
      const hFrac = layer.height[0] + rand() * (layer.height[1] - layer.height[0]);
      const wFrac = wr[0] + rand() * (wr[1] - wr[0]);
      const yJit = (rand() - 0.5) * f.h * 0.012;
      const px = Math.round(x + jitter + xOffset);
      const h = Math.round(f.h * hFrac);

      // The framing layers only populate the screen edges, leaving the clearing open.
      if (edges > 0) {
        const frac = px / f.w;
        if (frac > edges && frac < 1 - edges) continue;
      }
      const w = Math.max(3, Math.round(h * wFrac));
      if (px + w < 0 || px - w > f.w) continue;
      drawPine(f, spec, ctx, px, Math.round(baseY + yJit), h, w, layer.depth, spec.seed + i * 7919 + layer.spacing);
    }
  }

  function drawGround(f, spec, ctx) {
    const hy = ctx.horizonY, step = spec.ditherStep * 0.5;
    const snowAmt = ctx.season.snow;
    const fade = Math.max(3, Math.round(f.h * 0.03));

    for (let y = hy; y < f.h; y++) {
      const t = (y - hy) / Math.max(1, f.h - hy);
      // The clearing floor falls away into shadow toward the viewer.
      let base = mix(ctx.groundPal[2], ctx.groundPal[0], Math.pow(t, 0.55));
      base = mul(mul(base, ctx.season.tint), ctx.tint);
      base = mul(base, [0.82 - 0.30 * t, 0.82 - 0.30 * t, 0.82 - 0.30 * t]);
      if (snowAmt > 0) base = mix(base, mul(ctx.accent.snow, ctx.tint), snowAmt * 0.55);
      // Soften the seam where the ground meets the treeline.
      const seam = clamp((y - hy) / fade, 0, 1);

      for (let x = 0; x < f.w; x++) {
        const b = (BAYER[y & 3][x & 3] / 16 - 0.5) * step;
        let c = [base[0] + b, base[1] + b, base[2] + b];
        const n = hash2(x, y, spec.seed + 31);
        // Undergrowth uses the near layer's depth so the Kotlin port can reuse that palette.
        if (n < 0.05 && snowAmt < 0.5) c = S.canopyColour(ctx, 2 + ((n * 997) | 0) % 3, spec.layout.layers[2].depth);
        f.px(x, y, seam >= 1 ? c : mix(f.get(x, y), c, seam));
      }
    }
  }

  /**
   * Low scrub along the base of the treeline and scattered through the clearing. Without it the
   * ground reads as an empty band between the trees and the water.
   */
  function drawScrub(f, spec, ctx) {
    const layers = spec.layout.layers;
    const baseline = ctx.horizonY;
    const rand = R.rng(spec.seed ^ 0x5C2B);
    const count = Math.round(f.w / 5);
    const snowAmt = ctx.season.snow;

    for (let i = 0; i < count; i++) {
      const x0 = Math.round(rand() * f.w);
      const spread = rand();
      // Most clumps hug the treeline; a few stray out into the clearing.
      const y0 = Math.round(baseline + Math.pow(spread, 2.2) * (f.h - baseline) * 0.42);
      const rx = 2 + rand() * 5;
      const ry = 1.5 + rand() * 3;
      // Blended between the mid and near layer palettes, so the Kotlin port can mix the two
      // precomputed lookup entries and get an identical colour.

      for (let dy = -Math.round(ry); dy <= 0; dy++) {
        const t = 1 - Math.abs(dy) / ry;
        const hw = rx * Math.sqrt(Math.max(0, t));
        for (let dx = -Math.round(hw); dx <= Math.round(hw); dx++) {
          const x = x0 + dx, y = y0 + dy;
          const n = hash2(x, y, spec.seed + 611);
          if (n > 0.86) continue;                     // ragged edge rather than a smooth blob
          let shade = dy < -ry * 0.55 ? 4 : 2;
          if (n < 0.14) shade += 1;
          let c = mix(
            S.canopyColour(ctx, shade, layers[1].depth),
            S.canopyColour(ctx, shade, layers[2].depth),
            spread,
          );
          if (snowAmt > 0 && dy < -ry * 0.5) c = mix(c, mul(ctx.accent.snow, ctx.tint), snowAmt * 0.7);
          f.px(x, y, c);
        }
      }
    }
  }

  /**
   * A still pool in the clearing floor. It mirrors what stands *above the far shore* - the
   * treeline and the sky beyond it - compressed hard, because the water is seen at a glancing
   * angle. That is what makes the sky's colour shift read twice on screen.
   */
  function drawPool(f, spec, ctx) {
    const top = Math.round(f.h * spec.layout.poolTop);
    const bot = Math.round(f.h * spec.layout.poolBottom);
    const cx = f.w * 0.5, halfW = f.w * 0.27;
    const cy = (top + bot) / 2, ry = Math.max(1, (bot - top) / 2);
    const frozen = ctx.season.snow > 0.4;
    const REFLECT = 2.8;

    for (let y = top; y <= bot; y++) {
      const dy = (y - cy) / ry;
      // Perturb the ellipse so the water has a natural shoreline rather than a drawn oval.
      const wobbleEdge = 0.88 + 0.24 * patchNoise(0, y * 3, spec.seed + 401);
      const hw = halfW * Math.sqrt(Math.max(0, 1 - dy * dy)) * wobbleEdge;
      if (hw < 1) continue;

      const near = (y - top) / Math.max(1, bot - top);
      const srcY = Math.round(ctx.horizonY - (y - top) * REFLECT);
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);

      for (let x = x0; x <= x1; x++) {
        const wob = frozen ? 0 : Math.round(Math.sin(y * 0.7 + x * 0.11) * (0.4 + near * 1.4));
        let c = f.get(x + wob, srcY);
        c = frozen
          ? mix(mul(c, [0.74, 0.80, 0.90]), mul(ctx.accent.snow, ctx.tint), 0.38)
          : mul(c, [0.50, 0.57, 0.72]);
        // Darker at the near edge, and a rim of caught sky along the shoreline.
        c = mul(c, [1 - near * 0.28, 1 - near * 0.28, 1 - near * 0.24]);
        if (x <= x0 + 1 || x >= x1 - 1 || y <= top + 1) c = mix(c, ctx.haze, 0.18);
        const b = (BAYER[y & 3][x & 3] / 16 - 0.5) * spec.ditherStep * 0.45;
        f.px(x, y, [c[0] + b, c[1] + b, c[2] + b]);
      }
    }
  }

  return { drawPine: drawPine, drawLayer: drawLayer, drawGround: drawGround, drawScrub: drawScrub, drawPool: drawPool, hash2: hash2, patchNoise: patchNoise };
});
