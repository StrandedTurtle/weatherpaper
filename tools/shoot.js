'use strict';
// Renders a matrix of weather states to PNG contact sheets, so the art can be reviewed
// without building or installing anything.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const R = require('./render.js');
const C = require('./compose.js');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../art/scene.json'), 'utf8'));

const BASE = { hour: 13, sunrise: 6.2, sunset: 19.8, cloud: 0.15, precip: 'none', wind: 0.15, season: 'summer', condition: 'clear', tempC: 14, date: new Date('2026-09-02T12:00:00Z') };

function state(over) { return Object.assign({}, BASE, over); }

/** Tile frames into one contact sheet with a 1px gutter. */
function sheet(frames, cols, w, h, scale) {
  const rows = Math.ceil(frames.length / cols);
  const gw = w + 1, gh = h + 1;
  const W = cols * gw + 1, H = rows * gh + 1;
  const out = new Uint8Array(W * H * 3).fill(24);
  frames.forEach((fr, i) => {
    const ox = (i % cols) * gw + 1, oy = Math.floor(i / cols) * gh + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 3, d = ((oy + y) * W + ox + x) * 3;
        out[d] = fr.d[s]; out[d + 1] = fr.d[s + 1]; out[d + 2] = fr.d[s + 2];
      }
    }
  });
  return encodePNG(out, W, H, scale);
}

function run(name, cases, opts) {
  opts = opts || {};
  const w = opts.w || 150, h = opts.h || 300, scale = opts.scale || 1;
  const frames = cases.map(c => C.renderScene(spec, state(c.st), w, h, c.t || 0).frame);
  const outDir = path.join(__dirname, '../art/shots');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name + '.png');
  fs.writeFileSync(file, sheet(frames, opts.cols || cases.length, w, h, scale));
  console.log(name + ': ' + cases.map(c => c.label).join(' | ') + '  -> ' + file);
}

const SUITES = {
  time: [
    { label: '03:00 night', st: { hour: 3 } },
    { label: '06:00 dawn', st: { hour: 6.2 } },
    { label: '08:00 morning', st: { hour: 8 } },
    { label: '13:00 midday', st: { hour: 13 } },
    { label: '18:30 golden', st: { hour: 18.6 } },
    { label: '19:50 dusk', st: { hour: 19.8 } },
  ],
  weather: [
    { label: 'clear', st: { cloud: 0.05 } },
    { label: 'partly', st: { cloud: 0.45 } },
    { label: 'overcast', st: { cloud: 0.95, condition: 'overcast' } },
    { label: 'rain', st: { cloud: 0.85, precip: 'rain', wind: 0.4 }, t: 3000 },
    { label: 'heavy+wind', st: { cloud: 1.0, precip: 'heavy_rain', wind: 0.85 }, t: 5000 },
    { label: 'fog', st: { cloud: 0.7, condition: 'fog', wind: 0.05 } },
  ],
  seasons: [
    { label: 'spring', st: { season: 'spring' } },
    { label: 'summer', st: { season: 'summer' } },
    { label: 'autumn', st: { season: 'autumn' } },
    { label: 'winter', st: { season: 'winter', precip: 'snow', cloud: 0.6 }, t: 4000 },
  ],
};

const which = process.argv[2];
if (which && SUITES[which]) run(which, SUITES[which], { cols: SUITES[which].length });
else for (const k in SUITES) run(k, SUITES[k], { cols: SUITES[k].length });
