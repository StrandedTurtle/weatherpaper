// Authoring script for the first pass of the forest-cabin scene.
//
// art/scene.aseprite IS THE MASTER from here on. This file is kept as a record of
// how the first pass was laid out - the palette, the tree profiles, the control
// points for the ground edges. Re-running it rebuilds the sprite from scratch and
// will destroy anything drawn by hand in Aseprite since. Read it, steal numbers
// from it, do not run it without meaning to.
//
// It emits a {layer: [{x,y,color}]} map that was pushed through the aseprite MCP
// server's draw_pixels into the named layers.

'use strict';
const W = 160, H = 288;
const L = {};
function px(layer, x, y, c) {
  if (!c) return;
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  (L[layer] || (L[layer] = new Map())).set(x + ',' + y, c);
}
function rect(layer, x0, y0, x1, y1, c) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++)
    for (let x = Math.round(x0); x <= Math.round(x1); x++) px(layer, x, y, c);
}
const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
const bayer = (x, y) => (BAYER[((y%4)+4)%4][((x%4)+4)%4] + 0.5) / 16;

function ascii(layer, ox, oy, rows, map) {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx];
      if (ch === ' ' || ch === '.') continue;
      if (!map[ch]) throw new Error('unmapped ' + JSON.stringify(ch));
      px(layer, ox + dx, oy + dy, map[ch]);
    }
  });
}

// A lobed blob — the foliage clump shape the reference uses everywhere.
// `lobes` and `phase` are given per call so no two clumps repeat.
function clump(layer, cx, cy, rx, ry, c, lobes = 5, phase = 0, bite = 0.26) {
  for (let y = Math.round(cy - ry - 1); y <= Math.round(cy + ry + 1); y++) {
    for (let x = Math.round(cx - rx - 1); x <= Math.round(cx + rx + 1); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const a = Math.atan2(dy, dx);
      const r = 1 - bite * 0.5 + bite * 0.5 * Math.cos(lobes * a + phase);
      if (dx * dx + dy * dy <= r * r) px(layer, x, y, c);
    }
  }
}

// ---------------------------------------------------------------- palette
const P = {
  sky: ['#000000','#03060a','#070d11','#0b1419','#101b1e','#152321','#1a2a26','#1f312b','#243830'],
  starA:'#ffffff', starB:'#c4cfcd', starC:'#7e8c8a',
  moon:'#fbfcfc', moonEdge:'#b9c3c1',

  farMass:'#243329', farLit:'#2f4234',
  midMass:'#16221c', midBody:'#2f4835', midLit:'#4a7453', midDeep:'#0e1714',

  vergeDark:'#16251a', grassHi:'#7ba854', grassLit:'#5f8a42',
  grassMid:'#487033', grassLow:'#3a5c2a', grassDark:'#2a4020', grassDeep:'#1d2f17',
  pathCore:'#474639', pathLit:'#5a5744', pathEdge:'#2c2c24', pebble:'#6e6b59',

  roofHi:'#99a19e', roofLit:'#808a87', roofMid:'#5c6664', roofDark:'#3a4443', roofDeep:'#222b2a',
  wallLit:'#333b3a', wallMid:'#232a2a', wallDark:'#14181a', ink:'#05080a',
  trim:'#4a534f', chim:'#2b3331', chimDark:'#171d1c',

  nearMass:'#080d0d', nearTrunk:'#04090a', nearLit:'#1d2f22', nearMid:'#101a15',
  fenceLit:'#6f7466', fenceMid:'#4b4f45', fenceDark:'#2b2f28',
  rockLit:'#59615a', rockMid:'#343c38', rockDark:'#1b2220',
  shrubDark:'#0b1210', shrubMid:'#1b2b1c', shrubLit:'#33522f',
};

// ---------------------------------------------------------------- 01-sky
// Flat bands, black at the zenith warming to slate at the treeline. Dithering is
// confined to a 3px seam at each boundary; anywhere wider and it reads as noise.
{
  const bands = [46, 64, 80, 94, 106, 118, 130, 142, 172];
  const bandAt = y => { let i = 0; while (i < bands.length - 1 && y >= bands[i]) i++; return i; };
  for (let y = 0; y < 172; y++) {
    const i = bandAt(y);
    for (let x = 0; x < W; x++) {
      let c = P.sky[i];
      const edge = bands[i - 1] === undefined ? -99 : bands[i - 1];
      const d = y - edge;
      if (d >= 0 && d < 3 && (1 - d / 3) * 0.55 > bayer(x, y)) c = P.sky[i - 1];
      px('01-sky', x, y, c);
    }
  }

  // Stars, hand-placed: a drift down the canopy gap, thinning as the sky lightens.
  const stars = [
    [56,24,1],[70,19,2],[84,27,0],[97,21,1],[111,25,1],[126,18,2],[137,28,1],[44,31,2],
    [62,34,0],[77,30,1],[90,38,2],[118,33,0],[131,40,1],[142,35,2],[50,42,1],[66,45,2],
    [81,41,0],[94,47,1],[108,44,2],[123,50,1],[138,46,2],[39,50,2],[55,54,1],[72,51,0],
    [86,57,2],[100,55,1],[115,60,2],[129,56,1],[144,62,2],[46,63,1],[63,66,2],[78,64,1],
    [92,69,2],[106,66,0],[121,71,1],[135,68,2],[53,74,2],[69,77,1],[83,75,2],[98,79,1],
    [113,76,2],[127,81,2],[141,78,1],[42,83,2],[60,86,1],[75,88,2],[89,85,1],[104,90,2],
    [118,87,2],[133,92,1],[48,94,2],[65,97,1],[80,95,2],[95,100,2],[110,97,1],[124,102,2],
    [139,99,2],[57,105,2],[72,108,1],[87,106,2],[101,110,2],[116,107,2],[130,112,2],
    [44,113,2],[63,116,2],[78,114,2],[93,119,2],[108,117,2],[122,121,2],[136,118,2],
  ];
  const col = [P.starA, P.starB, P.starC];
  for (const [x, y, b] of stars) px('01-sky', x, y, col[b]);
  for (const [x, y] of [[84,27],[62,34],[118,33],[106,66],[72,51]]) px('01-sky', x + 1, y, P.starB);

  // Moon: low enough to survive a tall phone's 21-row top crop, and in the one
  // patch of sky that no canopy clump reaches into.
  ascii('01-sky', 64, 42, [
    '.eee.',
    'eMMMe',
    'eMMMM',
    'eMMMe',
    '.eee.',
  ], { e: P.moonEdge, M: P.moon });
}

// ---------------------------------------------------------- tree profiles
// Half-width per row, written out by hand top-to-bottom. The dips are drooping
// branch tiers. Starting part-way down an array gives a shorter tree of the same
// species without rescaling, which is what keeps them from looking stamped.
const PROF = {
  spruce: [0,1,1,0,1,2,2,1,2,3,2,3,4,3,4,5,4,5,6,5,6,7,6,7,8,7,8,9,8,9,10,9,11],
  fir:    [0,1,2,1,2,3,3,2,4,4,3,5,5,4,6,6,5,7,7,6,8,8,7,9,9,8,10,10,9,11,11,10,12],
  ragged: [1,0,1,1,2,1,3,2,2,3,4,3,3,5,4,4,6,5,5,7,6,6,8,7,7,9,8,8,10,9,9,11,10],
  pine:   [0,0,1,1,1,2,2,2,3,3,3,4,4,4,5,5,5,6,6,6,7,7,7,8,8,8,9,9,9,10,10,10,11],
  squat:  [0,2,2,3,4,3,5,5,4,6,7,6,8,7,9,9,8,10,11,10,12,11,13,13,12,14,15,14,16,15,17,16,18],
  snag:   [0,1,1,1,2,1,2,2,1,3,2,3,3,2,4,3,4,4,3,5,4,5,5,4,6,5,6,6,5,7,6,7,7],
};

function rimLight(layer, from, to, dirs) {
  const m = L[layer]; if (!m) return;
  const add = [];
  for (const [k, c] of m) {
    if (c !== from) continue;
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of dirs) {
      if (!m.has((x + dx) + ',' + (y + dy))) { add.push(k); break; }
    }
  }
  for (const k of add) m.set(k, to);
}
const UPLEFT = [[-1, 0], [0, -1]];
const DOWNLEFT = [[-1, 0], [0, 1]];

function tree(layer, cx, baseY, prof, startIdx, mass, lit, lean = 0) {
  const p = PROF[prof];
  const rows = p.length - startIdx;
  const topY = baseY - rows + 1;
  for (let i = startIdx; i < p.length; i++) {
    const k = i - startIdx;
    const y = topY + k;
    const c = cx + lean * (1 - k / rows);
    const half = p[i];
    const x0 = Math.round(c - half), x1 = Math.round(c + half);
    for (let x = x0; x <= x1; x++) px(layer, x, y, mass);
    // Moonlight on the shoulder wherever a tier steps outward.
  }
  // A stub of trunk below the skirt so nothing floats.
  for (let y = baseY + 1; y <= baseY + 3; y++) {
    px(layer, cx, y, mass); px(layer, cx + 1, y, mass);
  }
}

// ------------------------------------------------------- 02-far-ridge
// Furthest band. Values sit close to the sky so it reads as distance, not detail.
{
  const T = [
    // cx, baseY, profile, startIdx, lean
    [  4,150,'pine',  14, 0], [ 14,151,'spruce',16, 1], [ 23,149,'fir',   18,-1],
    [ 33,152,'ragged',15, 0], [ 42,150,'pine',  12, 1], [ 51,151,'snag',  13,-1],
    [ 60,149,'spruce',11, 0], [ 69,152,'fir',   17, 1], [ 78,150,'pine',  15,-1],
    [ 87,151,'ragged',13, 0], [ 96,149,'spruce',14, 1], [105,152,'fir',   19,-1],
    [114,150,'pine',  11, 0], [123,151,'snag',  12, 1], [132,149,'ragged',16,-1],
    [141,152,'spruce',13, 0], [150,150,'fir',   15, 1], [158,151,'pine',  13,-1],
  ];
  for (const [cx, b, pr, si, ln] of T) tree('02-far-ridge', cx, b, pr, si, P.farMass, P.farLit, ln);
  rect('02-far-ridge', 0, 150, W - 1, 158, P.farMass);
  rimLight('02-far-ridge', P.farMass, P.farLit, UPLEFT);
}

// ------------------------------------------------------ 03-mid-forest
// The wall the cabin stands against. Left of centre they crowd and overlap; a
// deliberate low gap from x 96 keeps the roofline reading against sky.
{
  const T = [
    [ -4,160,'squat',  4, 2], [ 11,161,'fir',    0,-1], [ 25,159,'spruce', 2, 1],
    [ 38,161,'ragged', 1, 0], [ 50,160,'pine',   0,-2], [ 63,161,'fir',    5, 1],
    [ 75,159,'spruce', 1, 0], [ 87,161,'ragged', 4,-1],
    // Right of the cabin: shorter, so the roof silhouette stays clean.
    [126,161,'spruce',12, 1], [137,160,'fir',   10,-1], [148,161,'ragged', 8, 0],
    [159,159,'squat', 13, 1],
  ];
  for (const [cx, b, pr, si, ln] of T) tree('03-mid-forest', cx, b, pr, si, P.midBody, P.midLit, ln);

  // Broadleaf masses breaking up the conifer rhythm, each placed and shaped by hand.
  const blobs = [
    [ 20,131, 9, 6, 5, 0.4], [ 52,127,11, 7, 6, 1.9], [ 78,133, 8, 5, 4, 3.1],
    [104,138, 7, 5, 5, 0.8], [136,130,10, 6, 6, 2.4],
  ];
  for (const [x, y, rx, ry, lo, ph] of blobs) clump('03-mid-forest', x, y, rx, ry, P.midBody, lo, ph);
  rimLight('03-mid-forest', P.midBody, P.midLit, UPLEFT);

  // Dark under-mass so the band is a forest floor edge, not floating cut-outs.
  for (let x = 0; x < W; x++) {
    const top = 154 + Math.round(1.5 * Math.sin(x * 0.19) + 1.0 * Math.sin(x * 0.07 + 2));
    for (let y = top; y <= 158; y++) px('03-mid-forest', x, y, P.midMass);
  }
  for (let x = 0; x < W; x++) for (let y = 157; y <= 161; y++) px('03-mid-forest', x, y, P.midDeep);
}

// Interpolate a hand-written control-point edge into a per-x boundary. Irregular
// because the numbers are chosen, not because a sine wave happened to land there.
function edge(points) {
  return x => {
    for (let i = 0; i < points.length - 1; i++) {
      const [xa, ya] = points[i], [xb, yb] = points[i + 1];
      if (x >= xa && x <= xb) return ya + (yb - ya) * (x - xa) / (xb - xa);
    }
    return points[x < points[0][0] ? 0 : points.length - 1][1];
  };
}
// Deterministic scatter for texture (grass marks, not objects).
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------- 04-ground
// One green floor, not a stack of bands. Value comes from deliberate shadow
// shapes cast off the treeline and the near foliage, plus grass texture.
{
  const HZ = 152;
  const crest = edge([[0,165],[14,161],[28,167],[42,162],[58,168],[70,163],[84,169],
                      [96,164],[110,170],[124,165],[138,171],[152,166],[159,169]]);
  const midLine = edge([[0,206],[18,214],[34,208],[52,220],[68,212],[86,224],
                        [104,215],[120,228],[136,218],[150,230],[159,222]]);
  const lowLine = edge([[0,248],[16,240],[32,252],[50,244],[66,256],[84,247],
                        [100,258],[118,250],[134,262],[150,252],[159,258]]);
  for (let x = 0; x < W; x++) {
    const c1 = crest(x), c2 = midLine(x), c3 = lowLine(x);
    for (let y = HZ; y < H; y++) {
      let c;
      if (y < HZ + 5) c = P.vergeDark;
      else if (y < c1) c = P.grassHi;          // the moonlit strip past the treeline
      else if (y < c2) c = P.grassLit;
      else if (y < c3) c = P.grassMid;
      else c = P.grassLow;
      px('04-ground', x, y, c);
    }
  }
  // Falloff: the clearing is brightest where the moon lands, dimming toward the
  // flanking trees and toward us. Two steps down the ramp, never more.
  const RAMP = [P.grassHi, P.grassLit, P.grassMid, P.grassLow, P.grassDark, P.grassDeep];
  const idx = new Map(RAMP.map((c, n) => [c, n]));
  const m = L['04-ground'];
  for (const [k, c] of m) {
    const n = idx.get(c); if (n === undefined) continue;
    const [x, y] = k.split(',').map(Number);
    const side = Math.pow(Math.abs(x - 84) / 84, 2.4);          // toward the flanking trees
    const near = Math.pow(Math.max(0, y - 214) / 74, 1.6);      // toward the viewer
    // Dither the step boundary, or the falloff draws contour rings.
    const t = side + near + (bayer(x, y) - 0.5) * 0.20;
    let step = 0;
    if (t > 0.46) step = 1;
    if (t > 0.96) step = 2;
    if (step) m.set(k, RAMP[Math.min(RAMP.length - 1, n + step)]);
  }

  // Grass texture: short dark strokes, denser as the ground comes toward us.
  for (let y = HZ + 6; y < H; y++) for (let x = 0; x < W; x++) {
    const depth = (y - HZ) / (H - HZ);
    // Two gates: a coarse one picks the patches, a fine one the blades inside them.
    if (hash(x >> 3, y >> 3) > 0.42 + 0.2 * depth) continue;
    if (hash(x, y) > 0.012 + 0.045 * depth) continue;
    px('04-ground', x, y, P.grassLow);
    if (hash(x, y + 91) < 0.5) px('04-ground', x, y - 1, P.grassLow);
  }

  // The path: a narrow, deliberate S from the bottom-left up toward the cabin.
  const spine = [
    [30,288,7.0],[37,268,6.3],[45,248,5.6],[53,230,4.9],[61,214,4.2],
    [68,200,3.5],[74,189,2.8],[79,180,2.2],[83,172,1.6],[86,165,1.0],
  ];
  const at = y => {
    for (let i = 0; i < spine.length - 1; i++) {
      const [xa, ya, wa] = spine[i], [xb, yb, wb] = spine[i + 1];
      if (y <= ya && y >= yb) { const t = (ya - y) / (ya - yb); return [xa + (xb - xa) * t, wa + (wb - wa) * t]; }
    }
    return null;
  };
  for (let y = 165; y < H; y++) {
    const s2 = at(y); if (!s2) continue;
    const [cx0, hw] = s2;
    const cx = cx0 + 1.0 * Math.sin(y * 0.09) + 0.5 * Math.sin(y * 0.29 + 2);
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      px('04-ground', x, y, Math.abs(x - cx) / hw > 0.72 ? P.pathEdge : P.pathCore);
    }
    if (hw > 3) for (let x = Math.round(cx - hw * 0.4); x <= Math.round(cx + hw * 0.35); x++) {
      if (hash(x, y) < 0.4) px('04-ground', x, y, P.pathLit);
    }
  }
  for (const [x, y] of [[32,281],[38,271],[29,263],[43,251],[36,244],[48,235],[41,227],
                        [54,219],[47,211],[59,203],[53,196],[64,190],[58,184],[69,180]]) {
    px('04-ground', x, y, P.pebble); px('04-ground', x + 1, y, P.pathLit);
  }
}

// ---------------------------------------------------------- 05-cabin
// Right of centre, standing on 04-ground. The moon is up and to the left, so the
// left roof plane carries the light and is the brightest shape in the picture.
{
  const APEX_X = 112, APEX_Y = 131, EAVE_Y = 156;
  const ROWS = EAVE_Y - APEX_Y;
  const SLOPE = 1.15;
  const WALL_L = 93, WALL_R = 135, WALL_B = 182;

  // Chimney first — it sits behind the roof.
  ascii('05-cabin', 97, 122, [
    'KKKKKKK','KcccccK','KcCCCcK','KcccccK','KcCCCcK','KcccccK','KcCCCcK','KcccccK',
    'KcCCCcK','KcccccK','KcCCCcK','KcccccK','KcCCCcK','KcccccK','KcCCCcK','KcccccK',
    'KcCCCcK','KcccccK','KcCCCcK','KcccccK','KcCCCcK','KcccccK','KcCCCcK','KcccccK',
  ], { K: P.ink, c: P.chimDark, C: P.chim });

  // Wall block, log courses, then the roof over the top of it.
  rect('05-cabin', WALL_L, EAVE_Y - 2, WALL_R, WALL_B, P.wallMid);
  for (let y = EAVE_Y; y <= WALL_B; y += 3) rect('05-cabin', WALL_L, y, WALL_R, y, P.wallDark);
  for (let y = EAVE_Y - 2; y <= WALL_B; y++) {
    px('05-cabin', WALL_L, y, P.ink); px('05-cabin', WALL_R, y, P.ink);
    px('05-cabin', WALL_L + 1, y, P.wallLit);           // moonlit corner
  }
  rect('05-cabin', WALL_L, WALL_B, WALL_R, WALL_B, P.ink);

  // Roof planes.
  for (let k = 0; k <= ROWS; k++) {
    const y = APEX_Y + k;
    const half = Math.round(k * SLOPE);
    const x0 = APEX_X - half, x1 = APEX_X + half;
    for (let x = x0; x <= x1; x++) {
      px('05-cabin', x, y, x < APEX_X ? P.roofLit : P.roofDark);
    }
    px('05-cabin', x0, y, P.ink); px('05-cabin', x1, y, P.ink);
    px('05-cabin', APEX_X, y, P.roofDeep);              // the ridge line itself
  }
  // Shingle courses: a break every three rows, staggered so they interlock.
  for (let k = 3; k <= ROWS; k += 3) {
    const y = APEX_Y + k, half = Math.round(k * SLOPE);
    for (let x = APEX_X - half + 2; x < APEX_X; x++) px('05-cabin', x, y, P.roofMid);
    for (let x = APEX_X + 1; x < APEX_X + half; x++) px('05-cabin', x, y, P.roofDeep);
    for (let x = APEX_X - half + 2 + ((k / 3) % 2 ? 0 : 2); x < APEX_X; x += 4) {
      px('05-cabin', x, y - 1, P.roofMid); px('05-cabin', x, y - 2, P.roofMid);
    }
  }
  for (const [x, y] of [[100,140],[106,146],[96,149],[103,152],[92,154]]) px('05-cabin', x, y, P.roofHi);
  // Eave shadow under the overhang.
  rect('05-cabin', APEX_X - Math.round(ROWS * SLOPE), EAVE_Y + 1, APEX_X + Math.round(ROWS * SLOPE), EAVE_Y + 1, P.ink);

  // Window and door, placed by hand.
  ascii('05-cabin', 99, 161, [
    'KKKKKKKKKK',
    'KFFFFFFFFK',
    'KFBBBBBBFK',
    'KFBBBBBBFK',
    'KFBBBBBBFK',
    'KFBBBBBBFK',
    'KFBBBBBBFK',
    'KFFFFFFFFK',
    'KKKKKKKKKK',
  ], { K: P.ink, F: P.trim, B: '#080c0e' });
  ascii('05-cabin', 117, 166, [
    'KKKKKKKKKK',
    'KFFFFFFFFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvFvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KFvvvvvvFK',
    'KKKKKKKKKK',
  ], { K: P.ink, F: P.trim, v: P.wallDark });

  // A lean-to porch post and rail on the shaded right end.
  for (let y = EAVE_Y + 2; y <= WALL_B; y++) { px('05-cabin', 132, y, P.wallDark); px('05-cabin', 133, y, P.ink); }
  rect('05-cabin', 128, 173, 133, 173, P.wallLit);
}

// A trunk that tapers, with branches given explicitly as [y, dir, len, rise].
function trunk(layer, x, yTop, yBase, wTop, wBase, c, lit, branches = []) {
  for (let y = yTop; y <= yBase; y++) {
    const t = (y - yTop) / (yBase - yTop);
    const w = Math.max(1, Math.round(wTop + (wBase - wTop) * t));
    for (let i = 0; i < w; i++) px(layer, x + i, y, c);
    if (lit && w >= 2) px(layer, x, y, lit);           // moonlit left edge
  }
  for (const [by, dir, len, rise] of branches) {
    let bx = dir > 0 ? x + 1 : x;
    let yy = by;
    for (let i = 0; i < len; i++) {
      bx += dir; if (i % Math.max(1, Math.round(1 / rise)) === 0) yy -= 1;
      px(layer, bx, yy, c);
      if (i > len * 0.55 && i % 3 === 0) { px(layer, bx, yy - 1, c); px(layer, bx + dir, yy - 1, c); }
    }
  }
}

// ------------------------------------------------------ 06-near-forest
// Mid-distance trunks standing on the clearing, plus the fence. Darker than the
// forest behind, lighter than the frame in front.
{
  trunk('06-near-forest', 46, 34, 170, 1, 4, P.nearMid, P.nearLit,
        [[60,1,12,0.4],[82,-1,10,0.5],[101,1,8,0.55],[120,-1,9,0.45],[138,1,7,0.5]]);
  // Sparse foliage, always sitting on a branch so nothing floats in the sky.
  const leaves = [
    [16,66,5,3,4,0.3],[33,86,6,4,5,1.7],[19,104,4,3,4,2.6],
    [58,57,6,4,5,0.9],[38,80,5,3,4,2.2],[54,99,5,4,5,1.1],[39,118,4,3,4,3.0],
    [62,76,5,3,4,0.6],[77,95,5,4,5,2.5],
  ];
  for (const [x, y, rx, ry, lo, ph] of leaves) clump('06-near-forest', x, y, rx, ry, P.nearMass, lo, ph);
  rimLight('06-near-forest', P.nearMass, P.nearLit, UPLEFT);

  // Split-rail fence on the moonlit grass, leaning the way old fences do.
  const posts = [[42,159,177],[56,161,178],[70,160,176]];
  for (const [x, t, b] of posts) {
    for (let y = t; y <= b; y++) { px('06-near-forest', x, y, P.fenceMid); px('06-near-forest', x + 1, y, P.fenceDark); }
    px('06-near-forest', x, t, P.fenceLit); px('06-near-forest', x, t + 1, P.fenceLit);
  }
  for (const [y0, y1] of [[164, 166], [171, 172]]) {
    for (let x = 42; x <= 71; x++) {
      const y = Math.round(y0 + (y1 - y0) * (x - 42) / 29);
      px('06-near-forest', x, y, P.fenceLit); px('06-near-forest', x, y + 1, P.fenceDark);
    }
  }
}

// ---------------------------------------------------------- 07-shrubs
// Everything growing out of the clearing floor. The undergrowth along the bottom
// is one connected mass with a lobed top edge - drawn as separate bushes it read
// as blobs scattered on a lawn.
{
  // Grass tufts, in deliberate clusters rather than evenly spaced specks.
  const clusters = [[10,171],[27,168],[44,173],[95,172],[112,169],[129,174],[146,170]];
  for (const [bx, by] of clusters) {
    for (let i = 0; i < 5; i++) {
      const x = bx + [0,3,-2,5,2][i], y = by + [0,1,2,0,3][i], h = [5,3,4,3,4][i];
      for (let k = 0; k < h; k++) px('07-shrubs', x, y - k, P.shrubMid);
      px('07-shrubs', x - 1, y - (h - 2), P.shrubMid);
      px('07-shrubs', x + 1, y - (h - 1), P.shrubMid);
      px('07-shrubs', x, y - h, P.shrubLit);
    }
  }

  // Boulders.
  ascii('07-shrubs', 3, 236, [
    '....KKKKKKKK....','..KKLLLLLLLLKK..','.KLLLLLLLLLLLLK.','KLLLLLLMMMMLLLLK',
    'KLLLLMMMMMMMMLLK','KLLMMMMMMMMMMMLK','KMMMMMMMMMMMMMMK','KMMMMMMMMMDDMMMK',
    'KMMMMMMDDDDDDMMK','KMMMDDDDDDDDDDMK','KDDDDDDDDDDDDDDK','.KDDDDDDDDDDDDK.',
    '..KKDDDDDDDDKK..','....KKKKKKKK....',
  ], { K: P.ink, L: P.rockLit, M: P.rockMid, D: P.rockDark });
  ascii('07-shrubs', 126, 244, [
    '..KKKKKK..','.KLLLLLLK.','KLLMMMMLLK','KMMMMMMMMK','KMMMMDDMMK','KMDDDDDDMK',
    '.KDDDDDDK.','..KKKKKK..',
  ], { K: P.ink, L: P.rockLit, M: P.rockMid, D: P.rockDark });
  ascii('07-shrubs', 96, 222, [
    '.KKKK.','KLLLLK','KMMMMK','KMDDMK','.KKKK.',
  ], { K: P.ink, L: P.rockLit, M: P.rockMid, D: P.rockDark });

  // The undergrowth wall: one silhouette, lobed along the top, filled solid below.
  const top = x => 264 + 10 * Math.sin(x * 0.065 + 0.4)
                       + 6 * Math.sin(x * 0.161 + 2.1)
                       + 3 * Math.sin(x * 0.317 + 4.2);
  for (let x = 0; x < W; x++) {
    const t = Math.round(top(x));
    for (let y = t; y < H; y++) px('07-shrubs', x, y, P.shrubDark);
    px('07-shrubs', x, t, P.shrubMid);
    if (top(x) < top(x - 1) && top(x) < top(x + 1)) {          // a lobe crest catches light
      px('07-shrubs', x, t, P.shrubLit); px('07-shrubs', x, t + 1, P.shrubMid);
    }
  }
  // Broad leaves picked out on the mass so it is foliage, not a black bar.
  const leaves = [
    [ 12,274,7,4,5,0.4],[ 30,282,6,4,6,2.1],[  4,266,6,4,5,1.3],[ 48,286,7,4,5,3.0],
    [ 68,278,6,4,6,0.7],[ 88,286,7,5,5,1.8],[106,276,6,4,6,2.6],[124,284,7,4,5,0.2],
    [142,278,6,4,6,1.5],[154,286,7,5,5,2.9],[ 58,270,5,3,6,0.9],[ 98,266,5,3,5,2.2],
  ];
  for (const [x, y, rx, ry, lo, ph] of leaves) {
    clump('07-shrubs', x, y, rx, ry, P.shrubMid, lo, ph, 0.36);
    clump('07-shrubs', x - 1, y - 1, rx * 0.45, ry * 0.45, P.shrubLit, lo, ph + 1.7, 0.36);
  }
}

// ----------------------------------------------------------- 08-frame
// The nearest plane: canopy hanging into the top of the shot and the big trunks
// down each side. Near-black - it is what makes the clearing feel enclosed.
{
  // Canopy ceiling: shallow over the sky gap, plunging at the corners.
  for (let x = 0; x < W; x++) {
    const d = 16 + 46 * Math.pow(Math.abs(x - 74) / 82, 2.1)
            + 5 * Math.sin(x * 0.19) + 3 * Math.sin(x * 0.41 + 1);
    for (let y = 0; y < d; y++) px('08-frame', x, y, P.nearMass);
  }
  const canopy = [
    [  4,54,16,11,5,0.3],[ 20,44,13, 9,6,1.9],[ 36,34,11, 7,5,2.7],[ 50,26, 9, 6,6,0.8],
    [ 64,21, 8, 5,5,2.2],[ 78,23, 9, 6,6,1.1],[ 92,28,10, 6,5,3.0],[106,34,11, 7,6,0.6],
    [120,42,13, 9,5,2.4],[136,52,15,10,6,1.5],[152,62,17,12,5,0.9],
  ];
  for (const [x, y, rx, ry, lo, ph] of canopy) clump('08-frame', x, y, rx, ry, P.nearMass, lo, ph, 0.40);

  // Four trunks, not eight, and thick enough to read as near. They run off the top
  // of the frame - crowns out of shot, so they are trunks and not lollipops.
  trunk('08-frame',   1, 0, 288, 6, 11, P.nearTrunk, P.nearMid,
        [[72,1,17,0.4],[112,1,12,0.5],[156,1,9,0.55]]);
  trunk('08-frame',  21, 0, 288, 2, 4, P.nearTrunk, P.nearMid,
        [[58,1,13,0.45],[96,1,10,0.5],[138,1,8,0.6]]);
  trunk('08-frame', 150, 0, 288, 6, 10, P.nearTrunk, P.nearMid,
        [[64,-1,15,0.45],[106,-1,11,0.5],[148,-1,9,0.55]]);
  const side = [
    [ 14,76, 8,5,5,0.5],[ 30,98, 7,5,6,2.3],[ 24,60, 6,4,5,1.2],[ 34,124, 6,4,6,2.8],
    [146,72, 8,5,5,1.7],[132,104, 7,5,6,0.4],[130,80, 6,4,5,2.9],[144,132, 7,5,6,1.1],
    // Right-hand leaf mass, carried further in and down: a tall phone crops the
    // right trunk away entirely, and the frame has to survive that.
    [136, 62,10,7,5,0.8],[128, 88, 9,6,6,2.5],[134,116, 9,6,5,1.4],
    [126,140, 8,5,6,3.0],[138,158, 9,6,5,0.3],[131,182, 8,5,6,2.0],
  ];
  for (const [x, y, rx, ry, lo, ph] of side) clump('08-frame', x, y, rx, ry, P.nearMass, lo, ph, 0.36);
  rimLight('08-frame', P.nearMass, P.nearLit, DOWNLEFT);
}

// ---------------------------------------------------------------- emit
const fs = require('fs');
const out = {};
let total = 0;
for (const name of Object.keys(L).sort()) {
  out[name] = [...L[name].entries()].map(([k, c]) => {
    const [x, y] = k.split(',');
    return { x: +x, y: +y, color: c };
  });
  total += out[name].length;
}
fs.writeFileSync(process.env.SP + '/layers.json', JSON.stringify(out));
console.error('layers: ' + Object.keys(out).map(n => n + '=' + out[n].length).join('  '));
console.error('total pixels: ' + total);
