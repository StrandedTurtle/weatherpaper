(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./render.js'), require('./scene.js'));
  else root.WeatherPaperOverlay = factory(root.WeatherPaper, root.WeatherPaperScene);
})(typeof self !== 'undefined' ? self : this, function (R, S) {
  'use strict';

  const clamp = R.clamp, mul = R.mul, mix = R.mix;

  /** Fold a place name down to what the 5x7 font can actually draw. */
  function normalise(text) {
    let s = String(text).toUpperCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s;
  }

  function glyph(spec, ch) {
    return spec.font.glyphs[ch] || (ch === ' ' ? spec.font.glyphs[' '] : spec.font.glyphs['?']);
  }

  function textWidth(spec, text, scale) {
    const adv = spec.font.w + spec.font.tracking;
    return text.length === 0 ? 0 : (text.length * adv - spec.font.tracking) * scale;
  }

  /**
   * Draw a string with a 1px dark outline. The outline is what keeps the readout legible over
   * both a bright noon sky and a near-black night canopy without needing a panel behind it.
   */
  function drawText(f, spec, text, x, y, scale, ink, outline) {
    const fw = spec.font.w, fh = spec.font.h, adv = fw + spec.font.tracking;
    const cols = text.length * adv;
    const mask = new Uint8Array(cols * fh);

    for (let i = 0; i < text.length; i++) {
      const rows = glyph(spec, text[i]).split('/');
      for (let gy = 0; gy < fh; gy++) {
        for (let gx = 0; gx < fw; gx++) {
          if (rows[gy][gx] === '#') mask[gy * cols + i * adv + gx] = 1;
        }
      }
    }

    function block(cx, cy, colour, alpha) {
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) f.blend(x + cx * scale + sx, y + cy * scale + sy, colour, alpha);
      }
    }

    for (let cy = 0; cy < fh; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (mask[cy * cols + cx]) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < fh && mask[ny * cols + nx]) { near = true; break; }
          }
        }
        if (near) block(cx, cy, outline, 0.78);
      }
    }
    for (let cy = 0; cy < fh; cy++) {
      for (let cx = 0; cx < cols; cx++) if (mask[cy * cols + cx]) block(cx, cy, ink, 1);
    }
  }

  const CONDITION_WORD = {
    none: null, drizzle: 'DRIZZLE', rain: 'RAIN', heavy_rain: 'RAIN', snow: 'SNOW',
  };

  function conditionWord(st) {
    if (st.thunder) return 'STORM';
    const p = CONDITION_WORD[st.precip];
    if (p) return p;
    if (st.condition === 'fog') return 'FOG';
    if (st.condition === 'overcast' || st.cloud > 0.85) return 'OVERCAST';
    if (st.cloud > 0.35) return 'PARTLY';
    return 'CLEAR';
  }

  function formatClock(st) {
    const h = Math.floor(st.hour) % 24;
    const m = Math.floor((st.hour - Math.floor(st.hour)) * 60);
    if (st.clock12) {
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return h12 + ':' + String(m).padStart(2, '0');
    }
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /** Build the lines the overlay will draw, honouring the user's content toggles. */
  function lines(spec, st, cfg) {
    const out = [];
    if (cfg.showClock) out.push({ text: formatClock(st), scale: 1 });

    const second = [];
    if (cfg.showTemp && st.tempC != null) second.push(Math.round(st.tempC) + '°');
    if (cfg.showCondition) second.push(conditionWord(st));
    if (second.length) out.push({ text: second.join(' '), scale: 0 });

    if (cfg.showLocation && st.place) out.push({ text: normalise(st.place), scale: 0 });
    return out;
  }

  /**
   * Draw the home-screen readout. Never called on the lock screen - the forest beneath is
   * identical, so locking reads as the text fading out rather than the scene re-laying-out.
   */
  function drawOverlay(f, spec, ctx, st, cfg) {
    if (!cfg || cfg.enabled === false) return;
    const ls = lines(spec, st, cfg);
    if (!ls.length) return;

    const size = Math.max(1, Math.round(cfg.size || 2));
    const ink = mix([236, 240, 234], mul([236, 240, 234], ctx.tint), 0.45);
    const outline = [6, 10, 8];
    const gap = Math.round(3 * size);

    let total = 0;
    ls.forEach(function (l) { total += spec.font.h * (size + l.scale) + gap; });
    total -= gap;

    let y = Math.round(clamp(cfg.y, 0, 1) * f.h - total / 2);
    ls.forEach(function (l) {
      const sc = size + l.scale;
      const w = textWidth(spec, l.text, sc);
      const x = Math.round(clamp(cfg.x, 0, 1) * f.w - w / 2);
      drawText(f, spec, l.text, x, y, sc, ink, outline);
      y += spec.font.h * sc + gap;
    });
  }

  return {
    drawOverlay: drawOverlay, drawText: drawText, textWidth: textWidth,
    conditionWord: conditionWord, formatClock: formatClock, normalise: normalise, lines: lines,
  };
});
