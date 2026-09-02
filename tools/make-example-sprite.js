'use strict';
// Produces art/examples/pine-mid.png: a working sprite drawn only with palette colours.
// It exists so the sprite path can be tried in one step, and opened in an editor as a model
// for how the slots are used.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const CH = require('./channels.js');

const ROOT = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scene.json'), 'utf8'));
const colours = CH.drawingColours(spec);

// '.' transparent, digits canopy shades, a-d trunk, 'w' catches snow, 'x' season accent.
const ART = [
  '........w.........',
  '.......w4w........',
  '.......545........',
  '......w4345w......',
  '......5433 5......'.replace(' ', '4'),
  '.....w433245w.....',
  '.....54332145.....',
  '....w4332x1245w...',
  '....543321124 5...'.replace(' ', '4'),
  '...w43321112245w..',
  '...5433211122455..',
  '..w4332111x2245w..',
  '..543321111224 5..'.replace(' ', '5'),
  '.w43321111122455w.',
  '.5433211bc11224 5.'.replace(' ', '5'),
  '.43321111bc1122455',
  'w4332111x1bc112245',
  '5433211111bc112245',
  '.4332111111bc11224',
  '..w33211111bc1122w',
  '...4321111 bc11224'.replace(' ', '1'),
  '....w321111bc1122.',
  '.....4321x1bc112..',
  '......w3211bc12...',
  '.......w311bc2....',
  '........w1bc1.....',
  '..........bc......',
  '..........bc......',
  '..........bc......',
  '..........bc......',
  '.........abcd.....',
  '.........abcd.....',
  '.........abcd.....',
  '........aabccd....',
  '........aabccd....',
  '.......aaabcccd...',
];

const W = Math.max.apply(null, ART.map(function (r) { return r.length; }));
const H = ART.length;
const rgba = new Uint8Array(W * H * 4);

function put(x, y, hex, a) {
  const i = (y * W + x) * 4;
  rgba[i] = parseInt(hex.slice(1, 3), 16);
  rgba[i + 1] = parseInt(hex.slice(3, 5), 16);
  rgba[i + 2] = parseInt(hex.slice(5, 7), 16);
  rgba[i + 3] = a;
}

for (let y = 0; y < H; y++) {
  const row = ART[y];
  for (let x = 0; x < W; x++) {
    const ch = x < row.length ? row[x] : '.';
    if (ch === '.') { put(x, y, '#000000', 0); continue; }
    const slot = CH.CHARS[ch];
    if (!slot) throw new Error('Example sprite uses unknown slot character: ' + ch);
    put(x, y, colours[slot[0] + slot[1]], 255);
  }
}

// Write RGBA so transparency survives; the encoder here is RGB-only, so pack manually.
const zlib = require('zlib');
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  let c = ~0;
  for (let i = 0; i < body.length; i++) c = crcTable[(c ^ body[i]) & 0xff] ^ (c >>> 8);
  const crc = Buffer.alloc(4); crc.writeUInt32BE((~c) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
const raw = Buffer.alloc(H * (W * 4 + 1));
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    raw[p++] = rgba[i]; raw[p++] = rgba[i + 1]; raw[p++] = rgba[i + 2]; raw[p++] = rgba[i + 3];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(ROOT, 'art/examples/pine-mid.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote art/examples/pine-mid.png (' + W + 'x' + H + ')');
