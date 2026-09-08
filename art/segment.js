'use strict';
// Works out WHAT each pixel is, so the relight can light it as that thing.
//
//   node art/segment.js            # writes art/materials.json + art/materials.png
//   node art/segment.js --report   # and prints the per-material census
//
// The previous approach lit by PLANE, and the planes are horizontal bands rather than objects -
// 09-canopy is rows 0-71, 07-near-forest 33-225, 08-foreground 226-287. A tree trunk runs through
// all three, and since every plane was also normalised against its own luminance range, identical
// bark either side of an arbitrary row got a different affine map. Measured down column x=14, the
// source was continuous across the 225/226 line (luminance 20 -> 19) and the relit frame was not
// (31 -> 13). That step is the unnatural edge; nothing in the picture is there.
//
// So classify by material instead. The artwork is k-means indexed to exactly 40 colours, which
// makes this 40 decisions rather than 46,080, and makes every boundary pixel-exact by definition:
// two pixels of the same palette entry are the same paint.
//
// Colour alone is not quite enough - near-black is both open sky and the deep inside of a tree -
// so the two ambiguous cases are settled spatially, by a flood fill and by the cabin's own plane.
const fs = require('fs');
const path = require('path');
const { decodePNG } = require('../tools/png-decode.js');
const { encodePNG } = require('../tools/png.js');

const ROOT = path.join(__dirname, '..');
const LAYERS = path.join(ROOT, 'art/layers');
const TABLE = path.join(ROOT, 'art/materials.json');
const MAPPNG = path.join(ROOT, 'art/materials.png');

/** Every material the relight knows how to light. Order is the index used in the map. */
const MATERIALS = ['sky', 'haze', 'foliage', 'grass', 'wood', 'stone'];

/**
 * Shadow is not a material.
 *
 * There is no `bark`. A first cut gave every cool dark pixel its own material and it took 27% of
 * the picture - the whole mid-distance treeline, and a brown speckle through the grass - because
 * "dark and not green" describes shadow far more often than it describes a trunk. This artwork
 * does not separate the two anyway: the trunk colours and the foliage colours overlap, so calling
 * them different materials invents a distinction the paint never made.
 *
 * Instead the unlit pixels are left UNSET and filled from their surroundings, so shadow inside a
 * tree is that tree and shadow between grass blades is grass. Both then get lit as what they are.
 */
const UNSET = 255;

/** False colours for the inspection render. Chosen to be told apart at a glance, not to be nice. */
const SWATCH = {
  sky: [40, 90, 200], haze: [150, 200, 220], foliage: [30, 150, 60],
  grass: [140, 210, 70], wood: [235, 130, 40], stone: [170, 170, 175],
};

/**
 * How far away each plane is, 0 at the horizon and 1 at the viewer.
 *
 * Used ONLY for atmospheric haze - a blend toward the sky colour with distance, which is what
 * distance actually does to a colour. Level is deliberately not taken from here: the artwork
 * already carries its own depth in the paint (the far treeline sits at luminance 58 against the
 * near trees' 19), and re-imposing a ladder on top is what produced the banding in the first
 * place.
 */
const PLANE_DEPTH = {
  '01-sky': 0, '02-stars': 0, '03-far-haze': 0.12, '04-mid-forest': 0.34,
  '05-ground': 0.55, '06-cabin': 0.48, '07-near-forest': 0.78, '08-foreground': 0.90,
  '09-canopy': 0.96,
};

function lum(c) { return 0.213 * c[0] + 0.715 * c[1] + 0.072 * c[2]; }

/** Rough paint family for a palette entry, before anything spatial is considered. */
function family(r, g, b) {
  const L = lum([r, g, b]);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (L > 150) return 'bright';                       // the moon, and the stars with it
  // Saturation is meaningless down here: a 1-2 level channel difference on near-black reads as
  // fully saturated and means nothing. Anything this dark is decided by where it is, not what
  // colour it claims to be.
  if (L <= 6) return 'void';
  if (g >= r && g >= b && sat > 0.20) return 'green';
  if (L >= 50 && sat <= 0.16) return 'pale';          // rock faces, the cabin roof
  return 'dark';                                      // trunks, and shadow in general
}

/** The stars-and-moon plane. Held out of everything below - see buildScene. */
const STARS_PLANE = '02-stars';

function build() {
  const planeFiles = fs.readdirSync(LAYERS).filter(f => f.endsWith('.png')).sort();
  const planes = planeFiles.map(f => ({
    name: f.replace(/\.png$/, ''),
    img: decodePNG(fs.readFileSync(path.join(LAYERS, f))),
  }));
  const W = planes[0].img.width, H = planes[0].img.height;
  const N = W * H;

  // The scene WITHOUT stars, flattened back to front.
  //
  // Stars and the moon are the brightest paint in the picture by a wide margin - luminance 189
  // against a sky of 0 - so leaving them in the base makes them the top of the tone curve, and
  // they survive into broad daylight as a grey disc and a scatter of white dots. They are not part
  // of the scene's material at all; they are an overlay, and relight.js composites them back at
  // whatever strength the hour calls for.
  const scene = { width: W, height: H, rgba: new Uint8Array(N * 4) };
  for (const p of planes) {
    if (p.name === STARS_PLANE) continue;
    for (let i = 0; i < N; i++) {
      const a = p.img.rgba[i * 4 + 3] / 255;
      if (a <= 0) continue;
      for (let k = 0; k < 3; k++) {
        scene.rgba[i * 4 + k] = Math.round(scene.rgba[i * 4 + k] * (1 - a) + p.img.rgba[i * 4 + k] * a);
      }
      scene.rgba[i * 4 + 3] = 255;
    }
  }
  for (let i = 0; i < N; i++) scene.rgba[i * 4 + 3] = 255;

  // Topmost opaque plane per pixel, and the depth that goes with it.
  const top = new Array(N).fill(null);
  const depthRaw = new Float32Array(N);
  for (const p of planes) {
    if (p.name === STARS_PLANE) continue;
    const d = PLANE_DEPTH[p.name];
    for (let i = 0; i < N; i++) {
      if (p.img.rgba[i * 4 + 3] < 128) continue;
      top[i] = p.name;
      if (d !== undefined) depthRaw[i] = d;
    }
  }

  // Palette. The image is indexed by construction, so this is exact.
  const palette = new Map();
  for (let i = 0; i < N; i++) {
    const r = scene.rgba[i * 4], g = scene.rgba[i * 4 + 1], b = scene.rgba[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    if (!palette.has(key)) palette.set(key, { r, g, b, key, n: 0, fam: family(r, g, b) });
    palette.get(key).n++;
  }

  // The sky, by flood fill from the top edge through near-black only.
  //
  // Open sky is 81% pure black and trunks never get below luminance 8, so the boundary is sharp
  // and the threshold barely matters - 4, 6 and 8 all give the same treeline. An earlier attempt
  // stopped on "is it green", which black trunks are not, and the fill poured straight down them
  // to row 258.
  const sky = new Uint8Array(N);
  const stack = [];
  const dark = i => lum([scene.rgba[i * 4], scene.rgba[i * 4 + 1], scene.rgba[i * 4 + 2]]) <= 6;
  for (let x = 0; x < W; x++) if (dark(x) && !sky[x]) { sky[x] = 1; stack.push(x); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i / W) | 0;
    if (x > 0) { const j = i - 1; if (!sky[j] && dark(j)) { sky[j] = 1; stack.push(j); } }
    if (x < W - 1) { const j = i + 1; if (!sky[j] && dark(j)) { sky[j] = 1; stack.push(j); } }
    if (y > 0) { const j = i - W; if (!sky[j] && dark(j)) { sky[j] = 1; stack.push(j); } }
    if (y < H - 1) { const j = i + W; if (!sky[j] && dark(j)) { sky[j] = 1; stack.push(j); } }
  }

  // Grow it once into anything the sky plane still owns and no foliage covers - the painted cloud
  // and the horizon glow are sky too, and they are far too light for the flood to have reached.
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let i = 0; i < N; i++) {
      if (sky[i]) continue;
      if (top[i] !== '01-sky' && top[i] !== '03-far-haze') continue;
      const r = scene.rgba[i * 4], g = scene.rgba[i * 4 + 1], b = scene.rgba[i * 4 + 2];
      if (family(r, g, b) === 'green') continue;      // the distant treeline is not sky
      const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      if (nb.some(j => j >= 0 && sky[j])) add.push(i);
    }
    for (const i of add) sky[i] = 1;
  }

  // Close the pinholes. Dim stars and stray noise sit at luminance 7-8, just above the flood's
  // threshold of 6, so the fill goes round them and leaves single dark pixels stranded in open
  // sky - which read as dirt on the screen once the sky is bright. Anything almost surrounded by
  // sky is sky. The moon is exempt, and the drawn stars are composited back on top afterwards
  // from their own plane, so nothing is actually lost.
  for (let pass = 0; pass < 3; pass++) {
    const add = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (sky[i]) continue;
        let n = 0;
        if (sky[i - 1]) n++;
        if (sky[i + 1]) n++;
        if (sky[i - W]) n++;
        if (sky[i + W]) n++;
        if (n >= 3) add.push(i);
      }
    }
    if (!add.length) break;
    for (const i of add) sky[i] = 1;
  }

  // Topmost row of the ground plane per column: the terrain line, following the actual slope
  // rather than a horizontal cut.
  const ground = planes.find(p => p.name === '05-ground');
  const groundTop = new Int32Array(W).fill(H);
  if (ground) {
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if (ground.img.rgba[(y * W + x) * 4 + 3] >= 128) { groundTop[x] = y; break; }
      }
    }
  }

  return { scene, W, H, N, planes, top, depthRaw, palette, sky, groundTop };
}

/** Material for one pixel: palette family first, then the two spatial overrides. */
function materialAt(fam, topPlane, isSky, aboveGround) {
  if (isSky) return 'sky';
  // The moon and the stars are NOT a material. They are drawn once, into 02-stars, and composited
  // back at whatever strength the hour calls for. Giving them their own material meant they had no
  // entry in the lighting tables, fell through to the raw source colour, and hung in the midday
  // sky as a grey disc with a scatter of stars around it.
  if (fam === 'bright') return null;
  // The cabin's own plane decides wood - but only for its structure. The mask is a hand-drawn box
  // and it swallows 99 foliage pixels along the roofline; lighting those as timber is what put a
  // brown halo around the roof. Green stays green wherever it is found.
  if (topPlane === '06-cabin' && fam !== 'green') return 'wood';
  if (fam === 'green') {
    if (topPlane === '03-far-haze') return 'haze';
    if (topPlane === '05-ground' || topPlane === '08-foreground') return 'grass';
    return 'foliage';
  }
  // A pale patch on the ground is rock; the same paint above the treeline is mist. Without the
  // distinction the whole misty middle ground came out as a boulder field. The split is by the
  // terrain line rather than by plane, because the planes are bands and put mist in the near
  // forest - which is the mistake this whole pass exists to undo.
  if (fam === 'pale') return aboveGround ? 'haze' : 'stone';
  return null;                                        // unlit: decided by what surrounds it
}

/** Per-pixel material indices, plus a smoothed depth field for the haze. */
function segment() {
  const s = build();
  const { scene, W, H, N, top, depthRaw, sky, groundTop } = s;

  const override = fs.existsSync(TABLE)
    ? (JSON.parse(fs.readFileSync(TABLE, 'utf8')).entries || []).reduce((m, e) => {
        if (e.material) m.set(e.key, e.material);
        return m;
      }, new Map())
    : new Map();

  const mat = new Uint8Array(N).fill(UNSET);
  for (let i = 0; i < N; i++) {
    const r = scene.rgba[i * 4], g = scene.rgba[i * 4 + 1], b = scene.rgba[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    const forced = override.get(key);
    const aboveGround = ((i / W) | 0) < groundTop[i % W];
    const name = (forced && !sky[i]) ? forced : materialAt(family(r, g, b), top[i], sky[i], aboveGround);
    if (name) mat[i] = MATERIALS.indexOf(name);
  }

  // Fill the unlit pixels from the nearest lit one, breadth-first so it spreads evenly from every
  // edge at once. A pocket of shadow therefore takes the material of whatever encloses it, which
  // is the thing casting the shadow.
  const queue = [];
  for (let i = 0; i < N; i++) if (mat[i] !== UNSET) queue.push(i);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % W, y = (i / W) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of nb) {
      if (j < 0 || mat[j] !== UNSET) continue;
      // Sky never spreads: it is settled by the flood fill, and bleeding it inward would put
      // daylight inside a tree.
      if (MATERIALS[mat[i]] === 'sky') continue;
      mat[j] = mat[i];
      queue.push(j);
    }
  }
  for (let i = 0; i < N; i++) if (mat[i] === UNSET) mat[i] = MATERIALS.indexOf('foliage');

  // Smooth the depth so atmospheric haze has no step in it. The plane field is blocky by nature;
  // a hard edge in the haze would be the same banding bug wearing a different hat.
  let depth = depthRaw;
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0, n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= W) continue;
            sum += depth[yy * W + xx]; n++;
          }
        }
        out[y * W + x] = sum / n;
      }
    }
    depth = out;
  }

  return { W, H, N, mat, depth, sky, scene, palette: s.palette, top: s.top, MATERIALS };
}

module.exports = { segment, MATERIALS, PLANE_DEPTH, lum, family };

// ------------------------------------------------------------------ CLI
if (require.main === module) {
  const s = segment();
  const { W, H, N, mat } = s;

  // The hand-editable table. Re-running keeps whatever material you set here; everything else is
  // recomputed. `auto` is what the rules chose, so you can see what you are overriding.
  const rows = [...s.palette.values()].sort((a, b) => lum([a.r, a.g, a.b]) - lum([b.r, b.g, b.b]));
  const prior = fs.existsSync(TABLE)
    ? new Map((JSON.parse(fs.readFileSync(TABLE, 'utf8')).entries || []).map(e => [e.key, e.material]))
    : new Map();
  const counts = {};
  for (let i = 0; i < N; i++) counts[MATERIALS[mat[i]]] = (counts[MATERIALS[mat[i]]] || 0) + 1;

  const entries = rows.map(p => {
    const auto = materialAt(p.fam, null, false, false);
    return {
      key: p.key,
      rgb: [p.r, p.g, p.b],
      hex: '#' + p.key.toString(16).padStart(6, '0'),
      luminance: Math.round(lum([p.r, p.g, p.b])),
      pixels: p.n,
      family: p.fam,
      auto: auto || 'unlit (filled from surroundings)',
      material: prior.get(p.key) || null,
    };
  });

  fs.writeFileSync(TABLE, JSON.stringify({
    _comment: 'Generated by art/segment.js. Set "material" on an entry to override the rules; ' +
      'null means use "auto". Sky is decided by flood fill, not by palette, so overriding an ' +
      'entry does not pull pixels out of the sky. Re-running preserves your overrides.',
    materials: MATERIALS,
    entries: entries,
  }, null, 2) + '\n');

  const out = new Uint8Array(N * 3);
  for (let i = 0; i < N; i++) {
    const c = SWATCH[MATERIALS[mat[i]]] || [255, 0, 255];
    out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
  }
  fs.writeFileSync(MAPPNG, encodePNG(out, W, H, 1));

  console.log('segmented ' + W + 'x' + H + ' into ' + MATERIALS.length + ' materials');
  console.log('palette: ' + s.palette.size + ' entries -> art/materials.json');
  console.log('map:     art/materials.png (false colour)\n');
  for (const m of MATERIALS) {
    const n = counts[m] || 0;
    console.log('  ' + m.padEnd(9) + String(n).padStart(6) + ' px  ' + (100 * n / N).toFixed(1) + '%');
  }
}
