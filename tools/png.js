'use strict';
// Minimal PNG encoder. Node's zlib is all we need - no dependencies anywhere in this repo.
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgb: Uint8Array of w*h*3. Returns a PNG buffer, optionally nearest-neighbour upscaled. */
function encodePNG(rgb, w, h, scale = 1) {
  const ow = w * scale;
  const oh = h * scale;
  const raw = Buffer.alloc(oh * (ow * 3 + 1));
  let p = 0;
  for (let y = 0; y < oh; y++) {
    raw[p++] = 0; // filter: none
    const sy = (y / scale) | 0;
    for (let x = 0; x < ow; x++) {
      const si = (sy * w + ((x / scale) | 0)) * 3;
      raw[p++] = rgb[si];
      raw[p++] = rgb[si + 1];
      raw[p++] = rgb[si + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ow, 0);
  ihdr.writeUInt32BE(oh, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** rgba: Uint8Array of w*h*4. Same as encodePNG but keeps the alpha channel. */
function encodePNGA(rgba, w, h, scale = 1) {
  const ow = w * scale;
  const oh = h * scale;
  const raw = Buffer.alloc(oh * (ow * 4 + 1));
  let p = 0;
  for (let y = 0; y < oh; y++) {
    raw[p++] = 0;
    const sy = (y / scale) | 0;
    for (let x = 0; x < ow; x++) {
      const si = (sy * w + ((x / scale) | 0)) * 4;
      raw[p++] = rgba[si];
      raw[p++] = rgba[si + 1];
      raw[p++] = rgba[si + 2];
      raw[p++] = rgba[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ow, 0);
  ihdr.writeUInt32BE(oh, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // colour type: truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { encodePNG, encodePNGA };
