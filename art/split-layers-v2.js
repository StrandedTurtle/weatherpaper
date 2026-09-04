// Cut the reduced reference into depth planes - v2.
//
// v1 partitioned pixels by threshold. This partitions the SCENE, because what
// comes next needs real planes: fog is composited BETWEEN depths, rain and snow
// fall in front of some planes and behind others, and lighting needs the moon
// and stars separable from the sky they sit in.
//
// Nine planes, back to front:
//
//   01-sky          gradient only, full canvas - recolour for time of day
//   02-stars        stars and moon alone, so they can fade at dawn
//   03-far-haze     the misty band in the gap - the first thing fog thickens
//   04-mid-forest   the treeline that meets the sky
//   05-ground       clearing floor, path, stones - snow settles here
//   06-cabin        the cabin alone - lit windows, snow on the roof
//   07-near-forest  the trunks and foliage flanking the clearing
//   08-foreground   undergrowth along the bottom edge
//   09-canopy       overhead leaves at the top of the frame
//
// How each mask is found, and why:
//
//   cabin   by CHROMA, not green-excess. Weathered timber and shingle are grey
//           (chroma <= 12); the foliage around it is not (>= 20) even where it
//           is nearly black. Green-excess fails in deep shadow and the mask
//           bleeds into the trees.
//   sky     flood fill, BOUNDED by a hand-authored canopy opening. Deep forest
//           shadow is as black and as neutral as the sky, so an unbounded flood
//           walks straight down through the trees and takes 38% of the canvas.
//   ground  by colour, lower half only: lit and shadowed turf, plus the path.
//   depth   the rest is vegetation. Colour cannot order it - every palette class
//           spans nearly the full height and the luminance histogram has no
//           valleys - so the planes are hand-authored regions, with far-vs-mid
//           inside the gap resolved by blurred luminance, which is where the
//           reference does have real atmospheric perspective.
const fs = require('fs');
const path = require('path');
const SP = process.env.SP || path.join(__dirname, '.build');
const OUT = process.env.OUT || path.join(SP, 'v2');
fs.mkdirSync(OUT, { recursive: true });

const d = JSON.parse(fs.readFileSync(SP + '/reduced.json', 'utf8'));
const W = d.width, H = d.height, PAL = d.palette, IDX = d.index;
const rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const RGB = PAL.map(rgb);
const LUM = RGB.map(c => 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]);
const GRN = RGB.map(c => c[1] - (c[0] + c[2]) / 2);
const CHR = RGB.map(c => Math.max(...c) - Math.min(...c));
const at = (x,y) => IDX[y*W+x];
const lum = (x,y) => LUM[at(x,y)], grn = (x,y) => GRN[at(x,y)], chr = (x,y) => CHR[at(x,y)];
const inb = (x,y) => x >= 0 && y >= 0 && x < W && y < H;

const lerp = pts => x => {
  for (let i = 0; i < pts.length-1; i++) {
    const [xa,ya] = pts[i], [xb,yb] = pts[i+1];
    if (x >= xa && x <= xb) return ya + (yb-ya)*(x-xa)/(xb-xa);
  }
  return pts[x < pts[0][0] ? 0 : pts.length-1][1];
};
function flood(seeds, ok) {
  const m = new Uint8Array(W*H), st = [];
  for (const [x,y] of seeds) if (inb(x,y) && !m[y*W+x] && ok(x,y)) { m[y*W+x]=1; st.push([x,y]); }
  while (st.length) {
    const [x,y] = st.pop();
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
      const nx=x+dx, ny=y+dy;
      if (!inb(nx,ny) || m[ny*W+nx] || !ok(nx,ny)) continue;
      m[ny*W+nx]=1; st.push([nx,ny]);
    }
  }
  return m;
}
function fillHoles(m) {
  const edge = [];
  for (let x=0;x<W;x++) edge.push([x,0],[x,H-1]);
  for (let y=0;y<H;y++) edge.push([0,y],[W-1,y]);
  const outside = flood(edge, (x,y) => !m[y*W+x]);
  const r = Uint8Array.from(m);
  for (let i=0;i<W*H;i++) if (!m[i] && !outside[i]) r[i]=1;
  return r;
}

// ---------------------------------------------------------------- cabin
const BOX = { x0:83, x1:141, y0:161, y1:212 };   // read off the reduction
const inBox = (x,y) => x>=BOX.x0 && x<=BOX.x1 && y>=BOX.y0 && y<=BOX.y1;
const seeds = [];
for (let y=BOX.y0; y<=BOX.y1; y++) for (let x=BOX.x0; x<=BOX.x1; x++)
  if (lum(x,y) > 62 && chr(x,y) <= 12) seeds.push([x,y]);       // the moonlit roof
const cabin = fillHoles(flood(seeds, (x,y) => inBox(x,y) && chr(x,y) <= 12 && lum(x,y) >= 14));

// ---------------------------------------------------------------- sky
const skyFloor = lerp([[0,18],[30,24],[44,66],[52,118],[60,140],[72,150],[88,154],
                       [104,154],[118,150],[130,138],[140,92],[150,40],[159,18]]);
const skySeeds = [];
for (let y=0;y<50;y++) for (let x=0;x<W;x++) skySeeds.push([x,y]);
const sky = flood(skySeeds, (x,y) => !cabin[y*W+x] && y <= skyFloor(x) && grn(x,y) <= 4 && lum(x,y) < 50);
for (let p=0;p<3;p++) {                                          // absorb stars
  const add = [];
  for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++) {
    const i=y*W+x; if (sky[i] || cabin[i]) continue;
    let n=0; for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) if (sky[(y+dy)*W+x+dx]) n++;
    if (n>=5 && lum(x,y)>55) add.push(i);
  }
  for (const k of add) sky[k]=1;
}
const stars = new Uint8Array(W*H);
for (let i=0;i<W*H;i++) if (sky[i] && LUM[IDX[i]] > 45) stars[i]=1;

// ---------------------------------------------------------------- ground
const ground = new Uint8Array(W*H);
for (let y=178;y<H;y++) for (let x=0;x<W;x++) {
  const i=y*W+x; if (sky[i]||cabin[i]) continue;
  const g=grn(x,y), l=lum(x,y);
  if ((g>=14 && l>=38) || (g<=9 && l>=34 && l<=110 && y>200)) ground[i]=1;
}

// ------------------------------------------------- vegetation depth regions
const canopyBottom = lerp([[0,72],[24,64],[40,56],[50,40],[62,22],[100,12],
                           [120,18],[134,36],[146,54],[159,66]]);
const FORE_Y = 226;
// Where the near plane gives way to the distance. A straight vertical cut leaves
// a ruler-edge seam the moment two planes parallax at different rates, so the
// boundary is a threshold on blurred luminance instead: generous at the frame
// edges, strict through the gap. The seam then runs along real tree shapes.
const nearCut = lerp([[0,40],[40,38],[56,34],[70,27],[90,25],[110,27],
                      [126,33],[145,38],[159,40]]);
const FAR_CUT = 42;

// Blurred luminance, vegetation only: far-vs-mid inside the gap is real
// atmospheric perspective. Blurring keeps a tree whole instead of splitting its
// lit and shadowed halves across two planes.
const veg = (x,y) => !sky[y*W+x] && !cabin[y*W+x] && !ground[y*W+x];
const BL = new Float32Array(W*H), R = 4;
for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
  let s=0,n=0;
  for (let dy=-R;dy<=R;dy++) for (let dx=-R;dx<=R;dx++) {
    const nx=x+dx, ny=y+dy;
    if (!inb(nx,ny) || !veg(nx,ny)) continue;
    s += lum(nx,ny); n++;
  }
  BL[y*W+x] = n ? s/n : lum(x,y);
}

const NAMES = ['01-sky','02-stars','03-far-haze','04-mid-forest','05-ground',
               '06-cabin','07-near-forest','08-foreground','09-canopy'];
const owner = new Array(W*H);
for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
  const i=y*W+x;
  let L;
  if (stars[i])                        L = '02-stars';
  else if (sky[i])                     L = '01-sky';
  else if (cabin[i])                   L = '06-cabin';
  else if (ground[i])                  L = '05-ground';
  else if (y >= FORE_Y)                L = '08-foreground';
  else if (y < canopyBottom(x))        L = '09-canopy';
  else if (BL[i] < nearCut(x))         L = '07-near-forest';
  else if (BL[i] >= FAR_CUT)           L = '03-far-haze';
  else                                 L = '04-mid-forest';
  owner[i] = L;
}

// ------------------------------------------------------ de-speckle the planes
{
  const seen = new Uint8Array(W*H);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    const i=y*W+x; if (seen[i]) continue;
    const lab = owner[i], comp = [], st = [[x,y]]; seen[i]=1;
    while (st.length) {
      const [cx,cy] = st.pop(); comp.push(cy*W+cx);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=cx+dx, ny=cy+dy;
        if (!inb(nx,ny) || seen[ny*W+nx] || owner[ny*W+nx] !== lab) continue;
        seen[ny*W+nx]=1; st.push([nx,ny]);
      }
    }
    if (comp.length > 10 || lab === '02-stars') continue;   // stars are meant to be tiny
    const tally = new Map();
    for (const k of comp) {
      const cx=k%W, cy=(k/W)|0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=cx+dx, ny=cy+dy;
        if (!inb(nx,ny) || owner[ny*W+nx] === lab) continue;
        tally.set(owner[ny*W+nx], (tally.get(owner[ny*W+nx])||0)+1);
      }
    }
    if (!tally.size) continue;
    const best = [...tally].sort((a,b)=>b[1]-a[1])[0][0];
    for (const k of comp) owner[k] = best;
  }
}

// ---------------------------------------------------------------- emit
const out = {}; for (const n of NAMES) out[n] = new Map();
for (let y=0;y<H;y++) for (let x=0;x<W;x++) out[owner[y*W+x]].set(x+','+y, PAL[at(x,y)]);

// Backfill beneath sky and ground, so a parallax shift or a fog pass cannot
// punch through to nothing. Drawn under the planes above, so the flatten holds.
function rowMedian(y, pred) {
  const v = [];
  for (let x=0;x<W;x++) if (pred(x,y)) v.push(at(x,y));
  if (!v.length) return null;
  return PAL[v.sort((a,b)=>LUM[a]-LUM[b])[v.length>>1]];
}
const AFTER_GROUND = new Set(['06-cabin','07-near-forest','08-foreground','09-canopy']);
const groundTop = new Array(W).fill(H);
for (let x=0;x<W;x++) for (let y=0;y<H;y++) if (owner[y*W+x] === '05-ground') { groundTop[x]=y; break; }
// Sky only exists down to the treeline, but the rows below it still need
// something behind them, so the last known sky colour is carried down to where
// the ground starts. Between them the two backfills cover every pixel.
const skyRow = [], groundRow = [];
let lastSky = null;
for (let y=0;y<H;y++) {
  const s = rowMedian(y, (x,yy) => sky[yy*W+x] && !stars[yy*W+x]);
  if (s) lastSky = s;
  skyRow[y] = lastSky;
  groundRow[y] = rowMedian(y, (x,yy) => owner[yy*W+x] === '05-ground');
}
let lastGround = null;
for (let y=H-1;y>=0;y--) { if (groundRow[y]) lastGround = groundRow[y]; else groundRow[y] = lastGround; }
// 01-sky is the bottom plane, so it is filled edge to edge and doubles as the
// backdrop: sky above the treeline, ground colour below it. Nothing above it can
// ever open a hole, however the planes are shifted. It never affects the flatten.
for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
  const o = owner[y*W+x];
  if (o !== '01-sky') {
    const c = y < groundTop[x] ? skyRow[y] : (groundRow[y] || skyRow[y]);
    if (c) out['01-sky'].set(x+','+y, c);
  }
  if (groundRow[y] && y >= groundTop[x] && AFTER_GROUND.has(o)) out['05-ground'].set(x+','+y, groundRow[y]);
}

// ---------------------------------------------------------------- verify
const flat = new Array(W*H).fill(null);
for (const n of NAMES) for (const [k,c] of out[n]) { const [x,y]=k.split(',').map(Number); flat[y*W+x]=c; }
let bad = 0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (flat[y*W+x] !== PAL[at(x,y)]) bad++;
console.error('flatten mismatch: ' + bad + ' px');
if (bad) process.exit(1);

const json = {};
for (const n of NAMES) json[n] = [...out[n]].map(([k,color]) => {
  const [x,y]=k.split(',').map(Number); return {x,y,color};
});
fs.writeFileSync(OUT + '/layers.json', JSON.stringify(json));
fs.writeFileSync(OUT + '/palette.json', JSON.stringify(PAL));
const owned = {}; for (const n of NAMES) owned[n]=0;
for (let i=0;i<W*H;i++) owned[owner[i]]++;
console.error(NAMES.map(n => n.padEnd(15) + String(owned[n]).padStart(6) + ' own  ' +
              (100*owned[n]/(W*H)).toFixed(1).padStart(5) + '%  ' +
              String(json[n].length).padStart(6) + ' drawn').join('\n'));
