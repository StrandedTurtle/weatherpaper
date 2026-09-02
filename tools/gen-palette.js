'use strict';
// Writes the palette an artist loads into their editor, plus a labelled reference sheet.
//   art/palette.gpl            - import into Aseprite, GIMP, Piskel, Krita
//   art/palette-reference.png  - what each slot means
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const R = require('./render.js');
const O = require('./overlay.js');
const CH = require('./channels.js');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../art/scene.json'), 'utf8'));
const colours = CH.drawingColours(spec);
const slots = CH.slots(spec);

// A duplicate drawing colour would make two different slots indistinguishable to the importer.
const seen = new Map();
for (const s of slots) {
  const hex = colours[s.key].toUpperCase();
  if (seen.has(hex)) {
    console.error('Duplicate drawing colour ' + hex + ': ' + seen.get(hex) + ' and ' + s.key);
    process.exit(1);
  }
  seen.set(hex, s.key);
}

// ---- palette.gpl ----
let gpl = 'GIMP Palette\nName: WeatherPaper\nColumns: 8\n#\n';
gpl += '# Draw sprites using ONLY these colours. Each one names a slot the renderer\n';
gpl += '# resolves at draw time against depth, time of day and season.\n';
gpl += '# See ART.md. Transparent pixels are simply left empty (alpha 0).\n#\n';
for (const s of slots) {
  const c = R.hex(colours[s.key]);
  gpl += String(c[0]).padStart(3) + ' ' + String(c[1]).padStart(3) + ' ' + String(c[2]).padStart(3) +
    '\t' + CH.label(s) + '\n';
}
fs.writeFileSync(path.join(__dirname, '../art/palette.gpl'), gpl);

// ---- palette-reference.png ----
const SW = 18, PAD = 3, LABEL_W = 62, COLS = 3;
const rows = Math.ceil(slots.length / COLS);
const cellW = SW + 4 + LABEL_W, cellH = SW + PAD;
const W = COLS * cellW + PAD * 2, H = rows * cellH + PAD * 2;
const f = new R.Frame(W, H);

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f.px(x, y, [12, 20, 16]);

slots.forEach(function (s, i) {
  const col = i % COLS, row = (i / COLS) | 0;
  const x0 = PAD + col * cellW, y0 = PAD + row * cellH;
  const c = R.hex(colours[s.key]);
  for (let y = 0; y < SW; y++) {
    for (let x = 0; x < SW; x++) {
      const edge = x === 0 || y === 0 || x === SW - 1 || y === SW - 1;
      f.px(x0 + x, y0 + y, edge ? [60, 76, 68] : c);
    }
  }
  O.drawText(f, spec, CH.label(s), x0 + SW + 4, y0 + 5, 1, [198, 212, 201], [8, 14, 11]);
});

fs.writeFileSync(path.join(__dirname, '../art/palette-reference.png'), encodePNG(f.d, W, H, 3));
console.log('wrote art/palette.gpl and art/palette-reference.png (' + slots.length + ' slots)');
