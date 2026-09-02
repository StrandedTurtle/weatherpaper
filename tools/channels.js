(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WeatherPaperChannels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * The contract between hand-drawn sprites and the renderer.
   *
   * Sprites are *palette-indexed*, not literal colour. Each pixel you draw names a slot -
   * "canopy shade 5", "trunk shade 2" - and the renderer resolves that slot at draw time
   * against the depth layer, the time of day and the season. That indirection is the whole
   * reason a single drawing works at dawn, at midnight, in autumn and under snow.
   *
   * Draw with the exact colours in art/palette.gpl. Anything else is rejected by the importer.
   */

  // char -> { channel, index }. One character per pixel in the stored sprite rows.
  const CHARS = {
    '0': ['canopy', 0], '1': ['canopy', 1], '2': ['canopy', 2], '3': ['canopy', 3],
    '4': ['canopy', 4], '5': ['canopy', 5], '6': ['canopy', 6], '7': ['canopy', 7],
    'a': ['trunk', 0], 'b': ['trunk', 1], 'c': ['trunk', 2], 'd': ['trunk', 3],
    'g': ['ground', 0], 'h': ['ground', 1], 'i': ['ground', 2],
    'p': ['cloud', 0], 'q': ['cloud', 1], 'r': ['cloud', 2], 's': ['cloud', 3],
    'w': ['snow', 0], 'x': ['accent', 0], 'y': ['glow', 0], 'z': ['star', 0],
  };

  const TRANSPARENT = '.';

  /**
   * Colours used *while drawing*. Forest slots use the real palette so the artwork looks close
   * to the finished thing in the editor; the dynamic slots (cloud, accent) use markers, because
   * their final colour is derived at runtime from the sky and the season.
   */
  function drawingColours(spec) {
    const map = {};
    spec.palette.canopy.forEach(function (hex, i) { map['canopy' + i] = hex; });
    spec.palette.trunk.forEach(function (hex, i) { map['trunk' + i] = hex; });
    spec.palette.ground.forEach(function (hex, i) { map['ground' + i] = hex; });
    // Cloud shading is resolved from the live sky haze, so these are markers, not final colour.
    ['#2C3540', '#586675', '#93A2AE', '#D2DBE2'].forEach(function (hex, i) { map['cloud' + i] = hex; });
    map['snow0'] = spec.palette.accent.snow;
    map['accent0'] = '#FF2FD0';   // marker: becomes autumn amber / spring blossom at runtime
    map['glow0'] = spec.palette.accent.sun;
    map['star0'] = spec.palette.accent.star;
    return map;
  }

  /** Human labels, in the order they appear in the palette file and reference sheet. */
  function slots(spec) {
    const out = [];
    for (const ch in CHARS) {
      const key = CHARS[ch][0] + CHARS[ch][1];
      out.push({ char: ch, channel: CHARS[ch][0], index: CHARS[ch][1], key: key });
    }
    return out;
  }

  function label(slot) {
    const single = { snow: 'SNOW', accent: 'ACCENT', glow: 'GLOW', star: 'STAR' };
    return single[slot.channel] || (slot.channel.toUpperCase() + ' ' + slot.index);
  }

  return {
    CHARS: CHARS, TRANSPARENT: TRANSPARENT,
    drawingColours: drawingColours, slots: slots, label: label,
  };
});
