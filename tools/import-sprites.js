'use strict';
// Turns hand-drawn PNGs in art/sprites/ into palette-indexed data the renderers can use.
//   node tools/import-sprites.js
// Writes art/sprites.json. Run gen-kotlin.js afterwards to push it into the app.
const fs = require('fs');
const path = require('path');
const { decodePNG } = require('./png-decode.js');
const CH = require('./channels.js');

const ROOT = path.join(__dirname, '..');
const SPRITE_DIR = path.join(ROOT, 'art/sprites');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scene.json'), 'utf8'));

/**
 * Sprites are placed at their drawn size and never rescaled - scaling pixel art by a
 * non-integer factor is exactly what makes it look mushy. The virtual canvas a real phone
 * produces is always about this tall, so a fixed drawn size holds up across devices.
 */
const REFERENCE_HEIGHT = 280;

// Which directory feeds which part of the scene, and where each sprite's origin sits.
const SETS = [
  { dir: 'trees/far', anchor: 'bottom', layer: 0 },
  { dir: 'trees/mid', anchor: 'bottom', layer: 1 },
  { dir: 'trees/near', anchor: 'bottom', layer: 2 },
  { dir: 'trees/frame', anchor: 'bottom', layer: 3 },
  { dir: 'scrub', anchor: 'bottom', layer: 2 },
  { dir: 'clouds', anchor: 'centre', layer: null },
  { dir: 'decor', anchor: 'centre', layer: null },
];

const colours = CH.drawingColours(spec);
const slots = CH.slots(spec);

// Exact-match lookup from packed RGB to the character that encodes that slot.
const byRgb = new Map();
for (const s of slots) {
  const h = colours[s.key];
  const rgb = (parseInt(h.slice(1, 3), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(5, 7), 16);
  byRgb.set(rgb, s.char);
}

function nearestSlot(r, g, b) {
  let best = null, bestD = Infinity;
  for (const s of slots) {
    const h = colours[s.key];
    const dr = r - parseInt(h.slice(1, 3), 16);
    const dg = g - parseInt(h.slice(3, 5), 16);
    const db = b - parseInt(h.slice(5, 7), 16);
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

const errors = [];
const warnings = [];

function importSprite(file, set) {
  const img = decodePNG(fs.readFileSync(file));
  const rel = path.relative(ROOT, file);
  const rows = [];
  let minX = img.width, maxX = -1, minY = img.height, maxY = -1;
  const unknown = new Map();

  for (let y = 0; y < img.height; y++) {
    let row = '';
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const a = img.rgba[i + 3];
      if (a < 128) { row += CH.TRANSPARENT; continue; }
      const rgb = (img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2];
      const ch = byRgb.get(rgb);
      if (ch === undefined) {
        const hex = '#' + rgb.toString(16).padStart(6, '0').toUpperCase();
        if (!unknown.has(hex)) {
          const n = nearestSlot(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]);
          unknown.set(hex, { x: x, y: y, hint: CH.label(n) });
        }
        row += CH.TRANSPARENT;
        continue;
      }
      row += ch;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    rows.push(row);
  }

  for (const [hex, info] of unknown) {
    errors.push(rel + ': colour ' + hex + ' at (' + info.x + ',' + info.y + ') is not in the palette. ' +
      'Closest slot is ' + info.hint + '. Load art/palette.gpl and use only those colours.');
  }
  if (maxX < 0) {
    warnings.push(rel + ': every pixel is transparent - skipped.');
    return null;
  }

  // Trim to the drawn bounds so stray canvas padding does not shift placement.
  const trimmed = [];
  for (let y = minY; y <= maxY; y++) trimmed.push(rows[y].slice(minX, maxX + 1));
  const w = maxX - minX + 1, h = maxY - minY + 1;

  return {
    name: path.basename(file, '.png'),
    w: w,
    h: h,
    ax: set.anchor === 'bottom' ? (w >> 1) : (w >> 1),
    ay: set.anchor === 'bottom' ? h - 1 : (h >> 1),
    rows: trimmed,
  };
}

function expectedRange(layerIndex) {
  const l = spec.layout.layers[layerIndex];
  return [Math.round(l.height[0] * REFERENCE_HEIGHT), Math.round(l.height[1] * REFERENCE_HEIGHT)];
}

const out = { reference: { height: REFERENCE_HEIGHT }, sets: {} };
let total = 0;

for (const set of SETS) {
  const dir = path.join(SPRITE_DIR, set.dir);
  out.sets[set.dir] = [];
  if (!fs.existsSync(dir)) continue;

  const files = fs.readdirSync(dir).filter(function (f) { return f.toLowerCase().endsWith('.png'); }).sort();
  for (const f of files) {
    const sprite = importSprite(path.join(dir, f), set);
    if (!sprite) continue;
    if (set.layer !== null && set.dir.startsWith('trees/')) {
      const [lo, hi] = expectedRange(set.layer);
      if (sprite.h < lo * 0.7 || sprite.h > hi * 1.3) {
        warnings.push(set.dir + '/' + f + ' is ' + sprite.h + 'px tall; this layer expects roughly ' +
          lo + '-' + hi + 'px. It will still draw, but the composition may not sit right.');
      }
    }
    out.sets[set.dir].push(sprite);
    total++;
  }
}

for (const w of warnings) console.warn('warning: ' + w);
if (errors.length) {
  for (const e of errors) console.error('error: ' + e);
  console.error('\n' + errors.length + ' problem(s). Nothing was written.');
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'art/sprites.json'), JSON.stringify(out, null, 2) + '\n');

console.log('imported ' + total + ' sprite(s) -> art/sprites.json');
for (const set of SETS) {
  const n = out.sets[set.dir].length;
  const extra = set.dir.startsWith('trees/')
    ? '  (expects ~' + expectedRange(set.layer).join('-') + 'px tall)'
    : '';
  console.log('  ' + set.dir.padEnd(12) + String(n).padStart(3) + extra + (n === 0 ? '  - falls back to the built-in procedural art' : ''));
}
