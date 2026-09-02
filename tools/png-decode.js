'use strict';
// Minimal PNG decoder, so hand-drawn sprites can be imported with no dependencies.
// Supports 8-bit greyscale, RGB, palette and alpha variants - which covers everything
// Aseprite, Piskel, Photoshop and GIMP export. Interlaced files are rejected with a clear
// message rather than decoded incorrectly.
const zlib = require('zlib');

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error('Unsupported PNG filter type ' + filter);
      }
      cur[i] = v & 0xff;
    }
  }
  return out;
}

/** Decode a PNG buffer to { width, height, rgba: Uint8Array }. */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file');

  let pos = 8;
  let width = 0, height = 0, depth = 0, colorType = 0;
  let palette = null, trns = null;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('Interlaced PNGs are not supported - re-export without interlacing');
      if (depth !== 8) throw new Error('Only 8-bit PNGs are supported (this one is ' + depth + '-bit)');
      if (!(colorType in CHANNELS)) throw new Error('Unsupported PNG colour type ' + colorType);
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const bpp = CHANNELS[colorType];
  const pixels = unfilter(zlib.inflateSync(Buffer.concat(idat)), width, height, bpp);
  const rgba = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const s = i * bpp, d = i * 4;
    switch (colorType) {
      case 0: rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = 255; break;
      case 2: rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = 255; break;
      case 3: {
        const p = pixels[s] * 3;
        rgba[d] = palette[p]; rgba[d + 1] = palette[p + 1]; rgba[d + 2] = palette[p + 2];
        rgba[d + 3] = trns && pixels[s] < trns.length ? trns[pixels[s]] : 255;
        break;
      }
      case 4: rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = pixels[s + 1]; break;
      case 6: rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = pixels[s + 3]; break;
    }
  }
  return { width: width, height: height, rgba: rgba };
}

module.exports = { decodePNG: decodePNG };
