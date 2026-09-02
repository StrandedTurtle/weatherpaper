package com.sylcolabs.weatherpaper.scene

import kotlin.math.roundToInt

/**
 * A software pixel buffer in the scene's own coordinate space.
 *
 * The scene is drawn here at its native pixel size (roughly 260px tall) and only then blitted to
 * the screen at an integer scale, which is what keeps the pixels square. Drawing into an IntArray
 * and handing it to Bitmap.setPixels in one go is far cheaper than per-pixel Canvas calls.
 */
internal class PixelBuffer(val w: Int, val h: Int) {
    val px = IntArray(w * h)

    fun clear() = px.fill(0)

    fun set(x: Int, y: Int, colour: Int) {
        if (x < 0 || y < 0 || x >= w || y >= h) return
        px[y * w + x] = colour or ALPHA
    }

    fun get(x: Int, y: Int): Int {
        val cx = if (x < 0) 0 else if (x >= w) w - 1 else x
        val cy = if (y < 0) 0 else if (y >= h) h - 1 else y
        return px[cy * w + cx]
    }

    /** Source-over blend of an opaque colour at [a] (0..1). */
    fun blend(x: Int, y: Int, colour: Int, a: Float) {
        if (a <= 0f || x < 0 || y < 0 || x >= w || y >= h) return
        if (a >= 1f) { set(x, y, colour); return }
        val i = y * w + x
        val d = px[i]
        // An untouched (fully transparent) pixel has nothing to blend against.
        if (d ushr 24 == 0) { px[i] = Colour.scale(colour, a) or ALPHA; return }
        px[i] = Colour.mix(d, colour, a) or ALPHA
    }

    companion object { const val ALPHA = 0xFF shl 24 }
}

/** Integer colour maths on 0xRRGGBB values. Kept allocation-free for the inner loops. */
internal object Colour {
    fun of(r: Int, g: Int, b: Int) = (clamp(r) shl 16) or (clamp(g) shl 8) or clamp(b)
    fun red(c: Int) = (c ushr 16) and 0xFF
    fun green(c: Int) = (c ushr 8) and 0xFF
    fun blue(c: Int) = c and 0xFF

    fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v

    fun mix(a: Int, b: Int, t: Float): Int {
        if (t <= 0f) return a and 0xFFFFFF
        if (t >= 1f) return b and 0xFFFFFF
        return of(
            (red(a) + (red(b) - red(a)) * t).roundToInt(),
            (green(a) + (green(b) - green(a)) * t).roundToInt(),
            (blue(a) + (blue(b) - blue(a)) * t).roundToInt(),
        )
    }

    fun scale(c: Int, m: Float) = of((red(c) * m).roundToInt(), (green(c) * m).roundToInt(), (blue(c) * m).roundToInt())

    fun tint(c: Int, r: Float, g: Float, b: Float) =
        of((red(c) * r).roundToInt(), (green(c) * g).roundToInt(), (blue(c) * b).roundToInt())

    fun offset(c: Int, d: Int) = of(red(c) + d, green(c) + d, blue(c) + d)

    /** Quantise each channel to [step], having already added the dither offset. */
    fun quantise(c: Int, offsetAmount: Float, step: Float): Int {
        val o = offsetAmount
        return of(
            (((red(c) + o) / step).roundToInt() * step).toInt(),
            (((green(c) + o) / step).roundToInt() * step).toInt(),
            (((blue(c) + o) / step).roundToInt() * step).toInt(),
        )
    }

    fun luma(c: Int) = (red(c) + green(c) + blue(c)) / 3

    /** Sample a colour ramp at t in 0..1. */
    fun ramp(stops: IntArray, t: Float): Int {
        if (t <= 0f) return stops[0]
        if (t >= 1f) return stops[stops.size - 1]
        val s = t * (stops.size - 1)
        val i = s.toInt()
        return mix(stops[i], stops[i + 1], s - i)
    }

    /** Resample a ramp of any length to [n] evenly spaced stops, so ramps can be cross-faded. */
    fun resample(stops: IntArray, n: Int) = IntArray(n) { ramp(stops, it.toFloat() / (n - 1)) }
}

internal object Noise {
    val BAYER = arrayOf(
        intArrayOf(0, 8, 2, 10),
        intArrayOf(12, 4, 14, 6),
        intArrayOf(3, 11, 1, 9),
        intArrayOf(15, 7, 13, 5),
    )

    /** Stable spatial hash: lets patches be generated on demand with no stored noise texture. */
    fun hash(x: Int, y: Int, seed: Int): Float {
        var n = x * 374761393 + y * 668265263 + seed * 1274126177
        n = (n xor (n ushr 13)) * 1274126177
        return ((n xor (n ushr 16)).toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }

    /** Blocky value noise at two cell sizes, so patches have irregular edges. */
    fun patch(x: Int, y: Int, seed: Int): Float =
        hash(x shr 2, y shr 2, seed) * 0.62f + hash(x shr 1, y shr 1, seed + 7) * 0.38f
}

/** mulberry32, matched bit-for-bit with tools/render.js so the preview and the device agree. */
internal class Rng(seed: Int) {
    private var a = seed
    fun next(): Float {
        a += 0x6D2B79F5.toInt()
        var t = a xor (a ushr 15)
        t *= 1 or a
        t = t xor (t + ((t xor (t ushr 7)) * (61 or t)))
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }
}

internal fun smoothStep(e0: Float, e1: Float, x: Float): Float {
    val t = ((x - e0) / (e1 - e0)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}
