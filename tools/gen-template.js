'use strict';
// Produces the files to draw into:
//   art/template/scene-160x288.png   an empty canvas at the exact size
//   art/template/guides.png          safe zone and horizon, to drop in as a reference layer
const fs = require('fs');
const path = require('path');
const { encodePNGA } = require('./png.js');
const R = require('./render.js');
const O = require('./overlay.js');

const ROOT = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scene.json'), 'utf8'));

const W = 160, H = 288;
// Worst-case crop, from a tall 1080x2400-class phone: 20 columns each side, 21 rows off the top.
const SAFE_X0 = 20, SAFE_X1 = W - 21, SAFE_Y0 = 21, SAFE_Y1 = H - 1;
const HORIZON = 172;

// Deliberately NOT palette colours: if a guide layer is left visible on export, the importer
// rejects it by name rather than silently turning guides into artwork.
const RED = [255, 0, 0], AMBER = [255, 204, 0], DIM = [255, 255, 255];

function blank() { return new Uint8Array(W * H * 4); }

function put(buf, x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}

const guides = blank();

// Safe-zone box, dashed so it reads as a guide rather than as art.
for (let x = SAFE_X0; x <= SAFE_X1; x++) {
  if ((x >> 1) % 2 === 0) { put(guides, x, SAFE_Y0, RED, 255); put(guides, x, SAFE_Y1, RED, 255); }
}
for (let y = SAFE_Y0; y <= SAFE_Y1; y++) {
  if ((y >> 1) % 2 === 0) { put(guides, SAFE_X0, y, RED, 255); put(guides, SAFE_X1, y, RED, 255); }
}

// Horizon.
for (let x = 0; x < W; x++) if ((x >> 1) % 2 === 0) put(guides, x, HORIZON, AMBER, 255);

// Centre line, faint.
for (let y = 0; y < H; y++) if (y % 4 === 0) put(guides, W / 2, y, DIM, 70);

// Labels, drawn through the same 5x7 font the app uses.
const frame = new R.Frame(W, H);
const mark = new Uint8Array(W * H);
frame.px = function (x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  mark[y * W + x] = 1;
};
frame.blend = frame.px;
O.drawText(frame, spec, 'SAFE', SAFE_X0 + 2, SAFE_Y0 + 3, 1, RED, [0, 0, 0]);
O.drawText(frame, spec, 'HORIZON 172', 2, HORIZON - 9, 1, AMBER, [0, 0, 0]);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!mark[y * W + x]) continue;
    const i = (y * W + x) * 3;
    put(guides, x, y, [frame.d[i], frame.d[i + 1], frame.d[i + 2]], 255);
  }
}

const dir = path.join(ROOT, 'art/template');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'scene-160x288.png'), encodePNGA(blank(), W, H, 1));
fs.writeFileSync(path.join(dir, 'guides.png'), encodePNGA(guides, W, H, 1));
fs.writeFileSync(path.join(dir, 'guides-preview.png'), encodePNGA(guides, W, H, 3));

console.log('canvas ' + W + 'x' + H);
console.log('safe zone: columns ' + SAFE_X0 + '-' + SAFE_X1 + ', rows ' + SAFE_Y0 + '-' + SAFE_Y1);
console.log('horizon guide at row ' + HORIZON);
console.log('wrote art/template/{scene-160x288,guides,guides-preview}.png');
