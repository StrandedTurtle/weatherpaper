// Copy each plane's parallax and sway from art/scene-meta.json into
// art/layers.json, which is what tools/gen-kotlin.js reads.
//
// import-layers.js preserves parallax and sway across re-imports, so hand edits
// in layers.json survive a rebuild - but a NEW layer set starts at zero, and
// that is what this fills in. Edit the numbers in split-layers-v3.js (PLANES).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scene-meta.json'), 'utf8'));
const manifestPath = path.join(ROOT, 'art/layers.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const byName = new Map(meta.planes.map(p => [p.name, p]));
let changed = 0;
for (const layer of manifest.layers) {
  const plane = byName.get(layer.source.replace(/\.png$/, ''));
  if (!plane) { console.warn('  no plane metadata for ' + layer.source); continue; }
  if (layer.parallax !== plane.parallax || layer.sway !== plane.sway) changed++;
  layer.parallax = plane.parallax;
  layer.sway = plane.sway;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('parallax applied to ' + manifest.layers.length + ' layer(s), ' + changed + ' changed');
