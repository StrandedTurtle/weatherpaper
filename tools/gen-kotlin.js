'use strict';
// Generates Kotlin constants from art/scene.json. Run after editing the spec:
//     node tools/gen-kotlin.js
// The output is generated - never edit Art.kt or PixelFont.kt by hand.
const fs = require('fs');
const path = require('path');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../art/scene.json'), 'utf8'));
const OUT = path.join(__dirname, '../app/src/main/java/com/sylcolabs/weatherpaper/scene');
const PKG = 'package com.sylcolabs.weatherpaper.scene';
const HEADER = '// GENERATED FROM art/scene.json BY tools/gen-kotlin.js - DO NOT EDIT BY HAND.\n' +
               '// Edit the spec and re-run the generator; the preview and the app then stay in step.\n';

const rgb = h => '0x' + h.slice(1).toUpperCase();
const ints = arr => 'intArrayOf(' + arr.map(rgb).join(', ') + ')';
const f = n => (Number.isInteger(n) ? n.toFixed(1) : String(n)) + 'f';

const L = spec.layout;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const PRECIP = ['drizzle', 'rain', 'heavy_rain', 'snow'];

let art = `${HEADER}\n${PKG}\n
/** Palette, ramps, layout and tuning constants for the forest scene. */
internal object Art {
    const val VIRTUAL_HEIGHT = ${spec.virtualHeight}
    const val SEED = ${spec.seed}
    const val DITHER_STEP = ${f(spec.ditherStep)}

    val CANOPY = ${ints(spec.palette.canopy)}
    val TRUNK = ${ints(spec.palette.trunk)}
    val GROUND = ${ints(spec.palette.ground)}

${Object.entries(spec.palette.accent).map(([k, v]) => `    const val ${k.toUpperCase()} = ${rgb(v)}`).join('\n')}

    val SKY_NIGHT = ${ints(spec.skyRamps.night)}
    val SKY_DAWN = ${ints(spec.skyRamps.dawn)}
    val SKY_DAY = ${ints(spec.skyRamps.day)}
    val SKY_DUSK = ${ints(spec.skyRamps.dusk)}

    const val HORIZON = ${f(L.horizon)}
    const val POOL_TOP = ${f(L.poolTop)}
    const val POOL_BOTTOM = ${f(L.poolBottom)}

    /** Foliage tint keyframes: night, golden hour, full day. */
    val TINT_NIGHT = floatArrayOf(0.40f, 0.48f, 0.70f)
    val TINT_GOLDEN = floatArrayOf(1.26f, 1.00f, 0.70f)

    class Season(
        val tintR: Float, val tintG: Float, val tintB: Float,
        val snow: Float, val accent: Int, val accentChance: Float,
    )

    /** Indexed by [Season] ordinal: spring, summer, autumn, winter. */
    val SEASONS = arrayOf(
${SEASONS.map(k => {
  const s = spec.seasons[k];
  return `        Season(${f(s.tint[0])}, ${f(s.tint[1])}, ${f(s.tint[2])}, ${f(s.snow)}, ${s.accent ? rgb(s.accent) : '0'}, ${f(s.accentChance)}),`;
}).join('\n')}
    )

    class Layer(
        val depth: Float, val baseY: Float,
        val hMin: Float, val hMax: Float,
        val wMin: Float, val wMax: Float,
        val spacing: Int, val sway: Float, val parallax: Float,
        val edgesOnly: Float, val salt: Int,
    )

    /** Back to front. The near and framing layers are edge-only, which is what leaves the clearing open. */
    val LAYERS = arrayOf(
${L.layers.map(l => `        Layer(${f(l.depth)}, ${f(l.baseY)}, ${f(l.height[0])}, ${f(l.height[1])}, ${f(l.widthRatio[0])}, ${f(l.widthRatio[1])}, ${l.spacing}, ${f(l.sway)}, ${f(l.parallax)}, ${f(l.edgesOnly || 0)}, ${l.name.length + 3}),`).join('\n')}
    )

    class Precip(val count: Int, val speed: Float, val length: Int, val alpha: Float)

    /** Indexed by [Precipitation] ordinal minus one (NONE has no entry). */
    val PRECIP = arrayOf(
${PRECIP.map(k => {
  const p = spec.precip[k];
  return `        Precip(${p.count}, ${f(p.speed)}, ${p.length}, ${f(p.alpha)}),`;
}).join('\n')}
    )
}
`;

// ---- font: 5x7 glyphs packed one per Long, bit (row * 5 + col) ----
const glyphs = spec.font.glyphs;
const order = Object.keys(glyphs);
const packed = order.map(ch => {
  const rows = glyphs[ch].split('/');
  let bits = 0n;
  for (let r = 0; r < spec.font.h; r++) {
    for (let c = 0; c < spec.font.w; c++) {
      if (rows[r][c] === '#') bits |= 1n << BigInt(r * spec.font.w + c);
    }
  }
  return bits;
});

const index = order.join('').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');

let font = `${HEADER}\n${PKG}\n
/**
 * 5x7 uppercase bitmap font for the home-screen readout.
 *
 * Each glyph is packed into one Long, bit (row * WIDTH + col) set where there is ink.
 * [INDEX] maps a character to its slot; anything not in it falls back to '?'.
 */
internal object PixelFont {
    const val WIDTH = ${spec.font.w}
    const val HEIGHT = ${spec.font.h}
    const val TRACKING = ${spec.font.tracking}
    const val ADVANCE = WIDTH + TRACKING

    const val INDEX = "${index}"

    val GLYPHS = longArrayOf(
${packed.map((b, i) => '        ' + b.toString() + 'L,' + (i % 4 === 3 ? '' : '')).join('\n')}
    )

    private val FALLBACK = INDEX.indexOf('?')

    fun glyph(c: Char): Long {
        val i = INDEX.indexOf(c)
        return GLYPHS[if (i >= 0) i else FALLBACK]
    }

    /** True where the glyph has ink at (col, row). */
    fun ink(g: Long, col: Int, row: Int): Boolean = (g ushr (row * WIDTH + col)) and 1L == 1L

    fun width(text: String, scale: Int): Int =
        if (text.isEmpty()) 0 else (text.length * ADVANCE - TRACKING) * scale
}
`;

// ---- sprites: hand-drawn art, when any has been imported ----
const spritesPath = path.join(__dirname, '../art/sprites.json');
const sprites = fs.existsSync(spritesPath)
  ? JSON.parse(fs.readFileSync(spritesPath, 'utf8'))
  : { sets: {} };

function named(key, want) {
  const list = (sprites.sets && sprites.sets[key]) || [];
  const found = list.find(function (sp) { return sp.name === want; });
  if (!found) return 'null';
  const rows = found.rows.map(function (r) { return '"' + r + '"'; }).join(', ');
  return 'Sprite(' + found.w + ', ' + found.h + ', ' + found.ax + ', ' + found.ay + ', arrayOf(' + rows + '))';
}

function setBlock(name, key) {
  const list = (sprites.sets && sprites.sets[key]) || [];
  if (!list.length) return '    val ' + name + ': Array<Sprite> = arrayOf()';
  return '    val ' + name + ': Array<Sprite> = arrayOf(\n' +
    list.map(function (sp) {
      const rows = sp.rows.map(function (r) { return '"' + r + '"'; }).join(',\n            ');
      return '        // ' + sp.name + ' (' + sp.w + 'x' + sp.h + ')\n' +
        '        Sprite(' + sp.w + ', ' + sp.h + ', ' + sp.ax + ', ' + sp.ay + ', arrayOf(\n            ' +
        rows + ',\n        )),';
    }).join('\n') + '\n    )';
}

const spriteCount = Object.keys(sprites.sets || {}).reduce(function (n, k) {
  return n + (sprites.sets[k] || []).length;
}, 0);

let spritesKt = `${HEADER}
${PKG}

/**
 * Hand-drawn sprites, imported from art/sprites/ by tools/import-sprites.js.
 *
 * Each pixel is a *slot* character, not a colour - SceneContext.spriteColour resolves it at
 * draw time against the depth layer, the time of day and the season. '.' is transparent.
 *
 * An empty set means nothing has been drawn for that part of the scene yet, and the built-in
 * procedural art is used instead. See ART.md.
 */
internal object Sprites {

    class Sprite(val w: Int, val h: Int, val ax: Int, val ay: Int, val rows: Array<String>)

${setBlock('TREES_FAR', 'trees/far')}

${setBlock('TREES_MID', 'trees/mid')}

${setBlock('TREES_NEAR', 'trees/near')}

${setBlock('TREES_FRAME', 'trees/frame')}

${setBlock('SCRUB', 'scrub')}

${setBlock('CLOUDS', 'clouds')}

    val SUN: Sprite? = ${named('decor', 'sun')}
    val MOON: Sprite? = ${named('decor', 'moon')}

    /** Tree sprites for a depth layer, back to front; empty means draw the procedural pine. */
    fun forLayer(index: Int): Array<Sprite> = when (index) {
        0 -> TREES_FAR
        1 -> TREES_MID
        2 -> TREES_NEAR
        3 -> TREES_FRAME
        else -> emptyArray()
    }
}
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'Art.kt'), art);
fs.writeFileSync(path.join(OUT, 'PixelFont.kt'), font);
fs.writeFileSync(path.join(OUT, 'Sprites.kt'), spritesKt);
console.log('generated Art.kt (' + spec.layout.layers.length + ' layers, ' + SEASONS.length + ' seasons)');
console.log('generated PixelFont.kt (' + order.length + ' glyphs)');
console.log('generated Sprites.kt (' + spriteCount + ' hand-drawn sprite(s)' +
  (spriteCount === 0 ? ' - the procedural art is in use)' : ')'));
