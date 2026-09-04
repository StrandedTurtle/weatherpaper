// Cut the reduced reference into the eight depth layers.
//
// Colour alone cannot segment this image - every palette class spans the full
// height - so the split is: a flood-filled sky, a grass-derived horizon, and
// hand-authored boxes for the cabin and the fence. It is an approximation of
// depth, chosen so the stack is useful for parallax later. The flatten is exact
// either way: every pixel is assigned to exactly one layer.
const fs = require('fs');
const SP = process.env.SP;
const d = JSON.parse(fs.readFileSync(SP + '/reduced.json', 'utf8'));
const W = d.width, H = d.height, PAL = d.palette, IDX = d.index;

const rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const RGB = PAL.map(rgb);
const LUM = RGB.map(c => 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]);
const GRN = RGB.map(c => c[1] - (c[0] + c[2]) / 2);
const at = (x, y) => IDX[y * W + x];

// ---- sky: flood fill from the top through neutral darks, then absorb stars
const sky = new Uint8Array(W * H);
const neutral = i => GRN[i] <= 4 && LUM[i] < 50;
const stack = [];
for (let y = 0; y < 60; y++) for (let x = 0; x < W; x++) {
  if (neutral(at(x, y)) && !sky[y*W+x]) { sky[y*W+x] = 1; stack.push([x, y]); }
}
while (stack.length) {
  const [x, y] = stack.pop();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x+dx, ny = y+dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || sky[ny*W+nx]) continue;
    if (!neutral(at(nx, ny))) continue;
    sky[ny*W+nx] = 1; stack.push([nx, ny]);
  }
}
// Stars and the moon sit inside the sky but are far too bright for the flood.
for (let pass = 0; pass < 3; pass++) {
  const add = [];
  for (let y = 1; y < H-1; y++) for (let x = 1; x < W-1; x++) {
    if (sky[y*W+x]) continue;
    let n = 0;
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) if (sky[(y+dy)*W+x+dx]) n++;
    if (n >= 5 && LUM[at(x,y)] > 55) add.push(y*W+x);
  }
  for (const k of add) sky[k] = 1;
}

// ---- horizon: the first sustained run of lit grass, per column, then smoothed
const grass = i => GRN[i] >= 15 && LUM[i] >= 45;
const raw = new Array(W).fill(H);
for (let x = 0; x < W; x++) {
  for (let y = 120; y < H - 10; y++) {
    let n = 0; for (let k = 0; k < 10; k++) if (grass(at(x, y+k))) n++;
    if (n >= 6) { raw[x] = y; break; }
  }
}
const horizon = new Array(W);
for (let x = 0; x < W; x++) {
  const win = [];
  for (let k = -6; k <= 6; k++) win.push(raw[Math.min(W-1, Math.max(0, x+k))]);
  win.sort((a,b) => a-b);
  horizon[x] = win[win.length >> 1];
}

// ---- hand-authored boxes, read off the magnified reduction
const inCabin = (x, y) => x >= 83 && x <= 147 && y >= 158 && y <= 213;
const inFence = (x, y) => x >= 48 && x <= 77 && y >= 195 && y <= 213;

const LAYERS = ['01-sky','02-far-ridge','03-mid-forest','04-ground','05-cabin','06-near-forest','07-shrubs','08-frame'];
const out = {}; for (const n of LAYERS) out[n] = new Map();
const owner = new Array(W * H);

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = at(x, y), L = LUM[i], G = GRN[i], hz = horizon[x];
  let layer;
  if (sky[y*W+x])                                   layer = '01-sky';
  else if (inCabin(x, y) && !(G >= 20 && L >= 55))   layer = '05-cabin';
  else if (inFence(x, y) && G <= 8 && L >= 34)       layer = '06-near-forest';
  else if (y >= hz)                                  layer = (L < 30) ? '07-shrubs' : '04-ground';
  else if (L < 24 && (y < 62 || x < 30 || x > 130))  layer = '08-frame';
  else if (y > hz - 16)                              layer = '02-far-ridge';
  else                                               layer = '03-mid-forest';
  out[layer].set(x + ',' + y, PAL[i]);
  owner[y*W+x] = layer;
}

// ---- backfill under sky and ground, so a parallax shift cannot punch a hole.
// Drawn underneath, so the flatten is untouched.
function rowMedian(y, pred) {
  const v = [];
  for (let x = 0; x < W; x++) if (pred(x, y)) v.push(at(x, y));
  if (!v.length) return null;
  v.sort((a,b) => LUM[a] - LUM[b]);
  return PAL[v[v.length >> 1]];
}
const AFTER_GROUND = new Set(['05-cabin', '06-near-forest', '07-shrubs', '08-frame']);
for (let y = 0; y < H; y++) {
  const s = rowMedian(y, (x, yy) => sky[yy*W+x]);
  const g = rowMedian(y, (x, yy) => owner[yy*W+x] === '04-ground');
  for (let x = 0; x < W; x++) {
    const o = owner[y*W+x];
    // 01-sky is first, so it can safely sit under anything.
    if (s && o !== '01-sky') out['01-sky'].set(x+','+y, s);
    // 04-ground may only underlie layers drawn after it, or it would cover the
    // ridge and forest layers that come before.
    if (g && y >= horizon[x] && AFTER_GROUND.has(o)) out['04-ground'].set(x+','+y, g);
  }
}

// ---- verify: compositing back to front must reproduce the reduction exactly
const flat = new Array(W * H).fill(null);
for (const n of LAYERS) for (const [k, c] of out[n]) { const [x, y] = k.split(',').map(Number); flat[y*W+x] = c; }
let bad = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (flat[y*W+x] !== PAL[at(x,y)]) bad++;
console.error('flatten mismatch: ' + bad + ' px');
if (bad) process.exit(1);

const json = {};
for (const n of LAYERS) json[n] = [...out[n]].map(([k, color]) => {
  const [x, y] = k.split(',').map(Number); return { x, y, color };
});
fs.writeFileSync(SP + '/layers.json', JSON.stringify(json));
fs.writeFileSync(SP + '/palette.json', JSON.stringify(PAL));
console.error('horizon y: ' + Math.min(...horizon) + '..' + Math.max(...horizon));
console.error(LAYERS.map(n => n + '=' + json[n].length).join('  '));
