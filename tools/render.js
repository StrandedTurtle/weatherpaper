(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WeatherPaper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ colour
  function hex(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function mul(c, m) { return [c[0] * m[0], c[1] * m[1], c[2] * m[2]]; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  /** Sample a colour ramp (array of rgb triples) at t in 0..1. */
  function rampAt(stops, t) {
    if (t <= 0) return stops[0];
    if (t >= 1) return stops[stops.length - 1];
    const s = t * (stops.length - 1), i = Math.floor(s);
    return mix(stops[i], stops[i + 1], s - i);
  }
  function resample(stops, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(rampAt(stops, i / (n - 1)));
    return out;
  }

  /** mulberry32 - small, fast, and trivial to port to Kotlin so device output matches. */
  function rng(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  // ------------------------------------------------------------------- frame
  function Frame(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 3); }
  Frame.prototype.px = function (x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.d[i] = clamp(c[0], 0, 255); this.d[i + 1] = clamp(c[1], 0, 255); this.d[i + 2] = clamp(c[2], 0, 255);
  };
  Frame.prototype.blend = function (x, y, c, a) {
    x |= 0; y |= 0;
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a >= 1) return this.px(x, y, c);
    const i = (y * this.w + x) * 3, d = this.d;
    d[i] = clamp(d[i] + (c[0] - d[i]) * a, 0, 255);
    d[i + 1] = clamp(d[i + 1] + (c[1] - d[i + 1]) * a, 0, 255);
    d[i + 2] = clamp(d[i + 2] + (c[2] - d[i + 2]) * a, 0, 255);
  };
  Frame.prototype.get = function (x, y) {
    x = clamp(x | 0, 0, this.w - 1); y = clamp(y | 0, 0, this.h - 1);
    const i = (y * this.w + x) * 3;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  };

  // ------------------------------------------------------------- sun & time
  /**
   * Sun altitude, normalised to -1..1. Positive is above the horizon; the value drives
   * sky colour, foliage tint, star visibility and which celestial body is drawn.
   */
  function sunAltitude(hour, sunrise, sunset) {
    const dayLen = sunset - sunrise;
    if (dayLen <= 0) return -1;
    if (hour >= sunrise && hour <= sunset) return Math.sin(Math.PI * ((hour - sunrise) / dayLen));
    const nightLen = 24 - dayLen;
    const since = hour > sunset ? hour - sunset : hour + 24 - sunset;
    return -Math.sin(Math.PI * (since / nightLen));
  }

  /** Illuminated fraction of the moon, 0 (new) to 1 (full), from a known new moon. */
  function moonPhase(date) {
    const SYNODIC = 29.530588853;
    const known = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const days = date.getTime() / 86400000 - known;
    return ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  }

  return {
    hex: hex, lerp: lerp, mix: mix, mul: mul, clamp: clamp, smooth: smooth,
    rampAt: rampAt, resample: resample, rng: rng, BAYER: BAYER,
    Frame: Frame, sunAltitude: sunAltitude, moonPhase: moonPhase,
  };
});
