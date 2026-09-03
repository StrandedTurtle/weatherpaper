'use strict';
// Builds the tile shown in Android's wallpaper picker by flattening the imported layers, so it
// is always the real artwork. Falls back to a plain placeholder when nothing is imported.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const { decodePNG } = require('./png-decode.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'app/src/main/res/drawable-nodpi/wallpaper_thumb.png');
const manifest = fs.existsSync(path.join(ROOT, 'art/layers.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'art/layers.json'), 'utf8'))
  : { layers: [] };

fs.mkdirSync(path.dirname(OUT), { recursive: true });

if (!manifest.layers || manifest.layers.length === 0) {
  const w = 96, h = 192, rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = 0x10; rgb[i * 3 + 1] = 0x13; rgb[i * 3 + 2] = 0x14; }
  fs.writeFileSync(OUT, encodePNG(rgb, w, h, 2));
  console.log('no layers imported - wrote a plain placeholder thumbnail');
  process.exit(0);
}

const W = manifest.width, H = manifest.height;
const out = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) { out[i * 3] = 0x10; out[i * 3 + 1] = 0x13; out[i * 3 + 2] = 0x14; }

for (const layer of manifest.layers) {
  const img = decodePNG(fs.readFileSync(path.join(ROOT, 'art/layers', layer.source)));
  for (let i = 0; i < W * H; i++) {
    const a = img.rgba[i * 4 + 3] / 255;
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) {
      out[i * 3 + c] = Math.round(out[i * 3 + c] * (1 - a) + img.rgba[i * 4 + c] * a);
    }
  }
}

const scale = Math.max(1, Math.round(400 / H));
fs.writeFileSync(OUT, encodePNG(out, W, H, scale));
console.log('thumbnail: ' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB at ' + (W * scale) + 'x' + (H * scale));
