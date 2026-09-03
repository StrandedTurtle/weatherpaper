'use strict';
// Flattens art/layers/ the way the app does - scaled by a whole number and cropped to a phone -
// so a scene can be checked before anything is built or installed.
//
//   node tools/preview-layers.js [screenWidth] [screenHeight]
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const { decodePNG } = require('./png-decode.js');

const ROOT = path.join(__dirname, '..');
const SW = parseInt(process.argv[2] || '1080', 10);
const SH = parseInt(process.argv[3] || '2400', 10);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/layers.json'), 'utf8'));
if (!manifest.layers || manifest.layers.length === 0) {
  console.error('Nothing in art/layers/ yet. Export your PNGs there and run tools/import-layers.js first.');
  process.exit(1);
}

const W = manifest.width, H = manifest.height;
const unit = Math.max(1, Math.ceil(Math.max(SW / W, SH / H)));
const outW = Math.ceil(SW / unit), outH = Math.ceil(SH / unit);   // preview at artwork scale
const offX = Math.round((outW - W) / 2);
const offY = manifest.anchor === 'centre' || manifest.anchor === 'center'
  ? Math.round((outH - H) / 2)
  : outH - H;

const out = new Uint8Array(outW * outH * 3);
for (let i = 0; i < outW * outH; i++) { out[i * 3] = 0x10; out[i * 3 + 1] = 0x13; out[i * 3 + 2] = 0x14; }

for (const layer of manifest.layers) {
  const img = decodePNG(fs.readFileSync(path.join(ROOT, 'art/layers', layer.source)));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + offX, dy = y + offY;
      if (dx < 0 || dy < 0 || dx >= outW || dy >= outH) continue;
      const s = (y * W + x) * 4, d = (dy * outW + dx) * 3;
      const a = img.rgba[s + 3] / 255;
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) out[d + c] = Math.round(out[d + c] * (1 - a) + img.rgba[s + c] * a);
    }
  }
}

const dir = path.join(ROOT, 'art/preview');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'composite-' + SW + 'x' + SH + '.png');
fs.writeFileSync(file, encodePNG(out, outW, outH, 3));

console.log('artwork      ' + W + 'x' + H);
console.log('screen       ' + SW + 'x' + SH + '  ->  ' + unit + ' screen px per artwork px');
console.log('visible      ' + Math.min(W, outW) + 'x' + Math.min(H, outH) + ' of the artwork');
if (outW < W) console.log('cropped      ' + Math.ceil((W - outW) / 2) + ' columns from each side');
if (outH < H) console.log('cropped      ' + (H - outH) + ' rows from the ' + (offY < 0 ? 'top' : 'edge'));
console.log('wrote        ' + path.relative(ROOT, file));
