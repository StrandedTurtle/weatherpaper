package com.sylcolabs.weatherpaper.scene

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Live weather drawn over the scene.
 *
 * Everything here is drawn on the artwork's pixel grid - a raindrop is [unit] screen pixels wide,
 * never a hairline - so the effects sit in the same world as the art instead of floating over it
 * as smooth vector graphics.
 *
 * Particles are a pure function of index and time: no allocation, no retained state, and the
 * same frame renders identically whenever it is drawn.
 */
internal object Effects {

    private val paint = Paint().apply {
        isAntiAlias = false
        isDither = false
        style = Paint.Style.FILL
    }
    private val rect = RectF()

    /** Ordered-dither thresholds. Breaks up alpha plateaus without going per-pixel. */
    private val BAYER = intArrayOf(
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5,
    )

    /** Cheap deterministic hash -> 0..1. Lets a particle's start be derived, not stored. */
    private fun hash(i: Int, salt: Int): Float {
        var n = i * 374761393 + salt * 668265263
        n = (n xor (n ushr 13)) * 1274126177
        return ((n xor (n ushr 16)).toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }

    private fun block(canvas: Canvas, x: Float, y: Float, w: Float, h: Float) {
        rect.set(x, y, x + w, y + h)
        canvas.drawRect(rect, paint)
    }

    /**
     * Rain, in three depth layers.
     *
     * The layering is what stops it looking like a screen door: far drops are short, faint, slow
     * and thin; near drops are long, bright, fast and thick. Wind slants all three, harder on the
     * near layer, which reads as depth.
     */
    fun rain(
        canvas: Canvas, b: RectF, unit: Float, timeMs: Long,
        intensity: Float, wind: Float, tint: Int,
    ) {
        if (intensity <= 0f) return
        val t = timeMs / 1000f
        val w = b.width()
        val h = b.height()

        for (layer in 0 until 3) {
            val depth = layer / 2f                                  // 0 far .. 1 near
            val count = ((30 + 90 * intensity) * (0.55f + depth)).roundToInt()
            val speed = (150f + 260f * depth) * (0.65f + 0.6f * intensity)
            val len = (3f + 6f * depth) * unit
            // The streak is drawn ALONG its travel, so wind tilts the drop itself. Drifting a
            // vertical bar sideways just makes upright rain that slides, which is what it looked
            // like before.
            val slant = wind * len * 1.35f
            paint.strokeWidth = if (layer == 2) 2f * unit else unit
            paint.strokeCap = Paint.Cap.BUTT
            paint.color = tint
            paint.alpha = ((34 + 78 * depth) * (0.5f + 0.5f * intensity)).roundToInt().coerceIn(14, 200)

            for (i in 0 until count) {
                val seed = layer * 977 + i
                val vr = 0.75f + hash(seed, 23) * 0.5f
                val y = (hash(seed, 31) * h + t * speed * vr) % (h + len)
                var x = (hash(seed, 11) * w + t * speed * vr * wind * 0.45f) % w
                if (x < 0) x += w
                canvas.drawLine(
                    b.left + x, b.top + y,
                    b.left + x - slant, b.top + y - len,
                    paint,
                )
            }
        }
        paint.strokeWidth = 0f

        // Rings where drops land on the water, low in the frame only.
        paint.alpha = (58 * intensity).roundToInt().coerceIn(0, 110)
        val splashes = (10 * intensity).roundToInt()
        for (i in 0 until splashes) {
            val phase = (t / 0.5f + hash(i, 61)) % 1f
            if (phase > 0.30f) continue
            val x = b.left + hash(i, 71) * w
            val y = b.top + h * (0.70f + hash(i, 83) * 0.28f)
            val r = (1f + phase * 6f) * unit
            block(canvas, x - r, y, unit, unit)                     // two ticks, not a smear
            block(canvas, x + r, y, unit, unit)
        }
    }

    /**
     * Snow: flakes of varying size drifting on their own sine, so no two fall alike and the
     * field does not read as a regular grid.
     */
    fun snow(
        canvas: Canvas, b: RectF, unit: Float, timeMs: Long,
        intensity: Float, wind: Float, tint: Int,
    ) {
        if (intensity <= 0f) return
        val t = timeMs / 1000f
        val w = b.width()
        val h = b.height()
        val count = (46 + 150 * intensity).roundToInt()

        paint.color = tint
        for (i in 0 until count) {
            val g = hash(i, 7)
            val size = if (g > 0.88f) 3f * unit else if (g > 0.60f) 2f * unit else unit
            val depth = size / (3f * unit)
            val fall = (14f + 26f * depth) * (0.7f + 0.6f * intensity)
            val sway = (2f + hash(i, 17) * 6f) * unit
            val period = 2.2f + hash(i, 29) * 3.4f

            var y = (hash(i, 37) * h + t * fall) % (h + size)
            var x = hash(i, 43) * w +
                sin(t / period + hash(i, 53) * 6.283f) * sway +
                wind * t * 22f * depth
            x = ((x % w) + w) % w

            paint.alpha = ((110 + 110 * depth) * (0.55f + 0.45f * intensity)).roundToInt().coerceIn(40, 235)
            block(canvas, b.left + x, b.top + y, size, size)
        }
    }

    /**
     * Fog: stepped horizontal bands that thicken toward the viewer and drift sideways.
     *
     * Alpha is quantised to a few levels rather than being a smooth gradient - a continuous
     * wash would read as a photo filter laid over pixel art.
     */
    fun fog(
        canvas: Canvas, b: RectF, unit: Float, timeMs: Long,
        amount: Float, wind: Float, tint: Int,
    ) {
        if (amount <= 0.02f) return
        val t = timeMs / 1000f
        val h = b.height()
        val w = b.width()
        val band = (unit * 2f).coerceAtLeast(2f)
        paint.color = tint

        /**
         * Density peaks around the horizon and eases off both above and below it. Fog that is
         * thickest at your feet reads as a wash laid over the picture; real murk sits in the
         * middle distance and you can still see the ground in front of you.
         */
        fun density(y: Float): Float {
            val f = ((y - b.top) / h).coerceIn(0f, 1f)
            val peak = 0.56f
            val spread = if (f < peak) 0.30f else 0.46f
            val d = 1f - (abs(f - peak) / spread).coerceAtMost(1f)
            return d * d
        }

        // 1. Base haze: smooth vertically, quantised to a few steps so it still reads as pixel art.
        var y = b.top + h * 0.18f
        while (y < b.bottom) {
            val a = amount * density(y) * 0.44f
            val stepped = (a * 6f).roundToInt() / 6f
            if (stepped > 0f) {
                paint.alpha = (stepped * 255f).roundToInt().coerceIn(0, 120)
                canvas.drawRect(b.left, y, b.right, y + band, paint)
            }
            y += band
        }

        // 2. Wisps, as soft elliptical patches. Tapering only along their length left them as
        //    flat 2px bars with hard ends; they need to fade vertically as well to read as fog.
        val wisps = 8
        for (i in 0 until wisps) {
            val wy = b.top + h * (0.32f + hash(i, 13) * 0.48f) + sin(t * 0.22f + i) * h * 0.012f
            val d = density(wy)
            if (d <= 0.02f) continue
            val span = w * (0.30f + hash(i, 17) * 0.5f)
            val tall = band * (3f + hash(i, 31) * 4f)
            val speed = (5f + wind * 30f) * (0.5f + hash(i, 19))
            var x = (hash(i, 23) * (w + span) + t * speed) % (w + span) - span
            val peakA = amount * d * (0.10f + hash(i, 29) * 0.12f)
            val cols = (span / unit).toInt().coerceAtLeast(1)
            val rows = (tall / band).toInt().coerceAtLeast(1)

            for (c in 0 until cols) {
                val hu = sin((c / cols.toFloat()) * 3.14159f)
                if (hu <= 0.02f) continue
                val px = b.left + x + c * unit
                if (px < b.left - unit || px > b.right) continue
                for (rIdx in 0 until rows) {
                    val vu = sin(((rIdx + 0.5f) / rows) * 3.14159f)
                    val a = peakA * hu * hu * vu
                    // Dither before quantising: snapping straight to levels turned the taper
                    // into flat plateaus with hard edges, which read as rectangles of fog.
                    val bias = (BAYER[(rIdx and 3) * 4 + (c and 3)] / 16f - 0.5f) * (1f / 8f)
                    val stepped = ((a + bias) * 8f).roundToInt() / 8f
                    if (stepped <= 0f) continue
                    paint.alpha = (stepped * 255f).roundToInt().coerceIn(0, 120)
                    val py = wy + rIdx * band
                    canvas.drawRect(px, py, px + unit, py + band, paint)
                }
            }
        }
    }

    /**
     * Thunderstorm flash: a double or triple strike inside a short window, then a long gap.
     * Returns the strength so callers can also brighten the scene itself.
     */
    fun lightning(timeMs: Long): Float {
        val period = 5200L
        val idx = (timeMs / period).toInt()
        if (hash(idx, 101) > 0.5f) return 0f
        val local = timeMs - idx * period - (hash(idx, 103) * 900f).toLong()
        if (local < 0 || local > 420) return 0f
        val strikes = intArrayOf(0, 70, 110, 260)
        var a = 0f
        for (i in strikes.indices) {
            val d = local - strikes[i]
            if (d in 0..60) a = maxOf(a, (1f - d / 60f) * (if (i % 2 == 0) 1f else 0.5f))
        }
        return a
    }

    /**
     * How brightly the cabin window is lit, 0..1.
     *
     * The artwork's cabin is dark in every frame, so the lamp is drawn on rather than painted in
     * - which is what lets it answer to the weather. Someone is home, and they turn it up when it
     * is filthy out.
     */
    fun windowGlow(st: SceneState, daylight: Float): Float {
        val dark = 1f - daylight
        if (dark <= 0.02f) return 0f
        val rough = maxOf(st.cloud, if (st.condition == SkyCondition.FOG) 0.8f else 0f)
        val falling = if (st.precip != Precipitation.NONE) 0.25f else 0f
        return (dark * (0.55f + 0.35f * rough + falling)).coerceIn(0f, 1f)
    }

    /** The lamp itself. Drawn over the scene, so near foliage does not occlude it - accepted. */
    fun drawWindows(canvas: Canvas, glow: Float, b: RectF, unit: Float) {
        if (glow <= 0.01f || !SceneMeta.PRESENT) return
        for (win in SceneMeta.WINDOWS) {
            val x = b.left + win[0] * unit
            val y = b.top + win[1] * unit
            val w = win[2] * unit
            val h = win[3] * unit
            paint.color = 0xFFFFC46A.toInt()
            // A soft surround first, so it reads as light coming through glass.
            paint.alpha = (glow * 0.28f * 255f).roundToInt().coerceIn(0, 255)
            canvas.drawRect(x - unit, y - unit, x + w + unit, y + h + unit, paint)
            paint.alpha = (glow * 0.92f * 255f).roundToInt().coerceIn(0, 255)
            canvas.drawRect(x, y, x + w, y + h, paint)
        }
    }

    fun flash(canvas: Canvas, b: RectF, strength: Float, tint: Int) {
        if (strength <= 0.01f) return
        paint.color = tint
        paint.alpha = (strength * 130f).roundToInt().coerceIn(0, 150)
        canvas.drawRect(b.left, b.top, b.right, b.bottom, paint)
    }
}
