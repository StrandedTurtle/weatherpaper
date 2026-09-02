(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./render.js'), require('./scene.js'), require('./forest.js'), require('./weather.js'), require('./overlay.js'));
  } else {
    root.WeatherPaperCompose = factory(root.WeatherPaper, root.WeatherPaperScene, root.WeatherPaperForest, root.WeatherPaperWx, root.WeatherPaperOverlay);
  }
})(typeof self !== 'undefined' ? self : this, function (R, S, F, W, O) {
  'use strict';

  /**
   * Draw the whole scene.
   *
   * On device the first four passes plus each tree layer live in cached bitmaps that are only
   * rebuilt when the weather state changes; per frame the cached layers are blitted at their
   * sway/parallax offset and only the weather effects are drawn live. This function renders
   * everything each call because it is the reference implementation, but the pass order and
   * the maths are identical.
   */
  function renderScene(spec, st, w, h, t, opts) {
    opts = opts || {};
    const f = new R.Frame(w, h);
    const ctx = S.buildContext(spec, st, w, h);
    const wind = st.wind || 0;
    const layers = spec.layout.layers;

    function offsetFor(layer, i) {
      const sway = Math.sin(t / 1000 * (0.32 + i * 0.11) + i * 1.7) * layer.sway * (0.35 + wind * 4.2);
      const parallax = (opts.offset || 0) * layer.parallax * w * 0.07;
      return sway + parallax;
    }

    S.drawSky(f, spec, ctx);
    S.drawStars(f, spec, ctx, t);
    S.drawCelestial(f, spec, ctx, R.moonPhase(st.date || new Date()));
    W.drawClouds(f, spec, ctx, st, t);

    F.drawLayer(f, spec, ctx, layers[0], offsetFor(layers[0], 0));
    F.drawGround(f, spec, ctx);
    F.drawScrub(f, spec, ctx);
    F.drawPool(f, spec, ctx);

    for (let i = 1; i < layers.length; i++) {
      F.drawLayer(f, spec, ctx, layers[i], offsetFor(layers[i], i));
    }

    const fog = st.condition === 'fog' ? 0.85 : (st.precip && st.precip !== 'none' ? 0.16 : 0.0);
    W.drawFog(f, spec, ctx, st, t, fog);
    W.drawPrecip(f, spec, ctx, st, t);
    if (st.thunder) W.drawLightning(f, ctx, W.lightningAlpha(t, spec.seed));

    // Home screen only. On the lock screen this pass is simply skipped.
    if (opts.overlay && !opts.locked) O.drawOverlay(f, spec, ctx, st, opts.overlay);

    return { frame: f, ctx: ctx };
  }

  return { renderScene: renderScene };
});
