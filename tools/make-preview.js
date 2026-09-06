// Build a self-contained scene inspector for the desktop.
//
//   node tools/make-preview.js            -> art/preview/preview.html
//
// The layer PNGs, art/scene-meta.json and the 5x7 readout font are all inlined,
// so the result is one file that opens straight off disk with no server. It
// mirrors SceneRenderer.kt exactly: the whole-number scale, the bottom-anchored
// crop, and the per-layer parallax offset.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'art/preview');
const OUT = path.join(OUT_DIR, 'preview.html');

const template = fs.readFileSync(path.join(__dirname, 'preview.template.html'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scene-meta.json'), 'utf8'));
const font = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/font.json'), 'utf8'));

const layerDir = path.join(ROOT, 'art/layers');
const files = fs.readdirSync(layerDir).filter(f => f.endsWith('.png')).sort();
if (!files.length) {
  console.error('No layers in art/layers - run art/rebuild.sh first.');
  process.exit(1);
}

const byName = new Map(meta.planes.map(p => [p.name, p]));
const planes = files.map(f => {
  const name = f.replace(/\.png$/, '');
  const plane = byName.get(name);
  if (!plane) throw new Error('art/scene-meta.json has no plane for ' + f);
  // Every motion field has to come through: a missing one reads as undefined in
  // the page's arithmetic and puts the whole plane at NaN, which draws nothing.
  for (const k of ['depth', 'parallax', 'sway', 'wind']) {
    if (typeof plane[k] !== 'number') throw new Error(name + ' has no numeric ' + k + ' in scene-meta.json');
  }
  return {
    name,
    depth: plane.depth,
    parallax: plane.parallax,
    sway: plane.sway,
    wind: plane.wind,
    note: plane.note,
    src: 'data:image/png;base64,' + fs.readFileSync(path.join(layerDir, f)).toString('base64'),
  };
});

// A plausible reading, so the readout previews at a realistic width rather than
// with placeholder text that is never the length the real thing will be.
const sample = { clock: '21:40', temp: '7°', condition: 'CLEAR', place: 'GLENCOE' };

const data =
  'var SCENE = ' + JSON.stringify({
    canvas: meta.canvas,
    planes,
    moon: meta.moon,
    cabin: { bbox: meta.cabin.bbox, openings: meta.cabin.openings },
    horizon: meta.horizon,
  }) + ';\n' +
  'var FONT = ' + JSON.stringify({ w: font.w, h: font.h, tracking: font.tracking, glyphs: font.glyphs }) + ';\n' +
  'var SAMPLE = ' + JSON.stringify(sample) + ';';

if (!template.includes('/*__DATA__*/')) throw new Error('template lost its /*__DATA__*/ marker');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, template.replace('/*__DATA__*/', data));
console.log('wrote ' + path.relative(ROOT, OUT) + '  ' +
            (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB, ' + planes.length + ' planes inlined');
