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

    private const val PI_F = 3.14159265f

    /** Drifting thicker patches in the fog. Each costs a few hundred rects, so this stays small. */
    private const val BANKS = 9

    /** What the unlit part of the moon is painted out with: the night sky it sits in. */
    private const val SHADOW = 0xFF0C1220.toInt()

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
     * The layering is what stops it looking like a screen door: far drops are short, faint and
     * slow; near drops are longer, brighter and faster. Wind slants all three, which reads as
     * depth.
     *
     * Rain is drawn MANY and FAINT. Few and bright gives long pale scratches across the picture
     * rather than weather - the eye reads an individual streak instead of the field of them - so
     * the streaks are kept short, one artwork pixel thick, and low enough in alpha that no single
     * one draws attention.
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
            val count = ((44 + 150 * intensity) * (0.6f + depth)).roundToInt()
            val speed = (150f + 260f * depth) * (0.65f + 0.6f * intensity)
            val len = (2f + 3.5f * depth) * unit
            // The streak is drawn ALONG its travel, so wind tilts the drop itself. Drifting a
            // vertical bar sideways just makes upright rain that slides, which is what it looked
            // like before.
            val slant = wind * len * 1.1f
            paint.strokeWidth = unit                                // never thicker than a pixel
            paint.strokeCap = Paint.Cap.BUTT
            paint.color = tint
            paint.alpha = ((20 + 46 * depth) * (0.55f + 0.45f * intensity)).roundToInt().coerceIn(10, 132)

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
        paint.alpha = (44 * intensity).roundToInt().coerceIn(0, 84)
        val splashes = (12 * intensity).roundToInt()
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
        val count = (110 + 300 * intensity).roundToInt()

        paint.color = tint
        for (i in 0 until count) {
            val g = hash(i, 7)
            // Two sizes, not three. A three-pixel flake is a visible white square at this scale.
            val size = if (g > 0.72f) 2f * unit else unit
            val depth = if (g > 0.72f) 1f else 0.45f
            val fall = (14f + 26f * depth) * (0.7f + 0.6f * intensity)
            val sway = (2f + hash(i, 17) * 6f) * unit
            val period = 2.2f + hash(i, 29) * 3.4f

            var y = (hash(i, 37) * h + t * fall) % (h + size)
            var x = hash(i, 43) * w +
                sin(t / period + hash(i, 53) * 6.283f) * sway +
                wind * t * 22f * depth
            x = ((x % w) + w) % w

            paint.alpha = ((44 + 96 * depth) * (0.55f + 0.45f * intensity)).roundToInt().coerceIn(22, 168)
            block(canvas, b.left + x, b.top + y, size, size)
        }
    }

    /**
     * Fog: a soft vertical haze with drifting banks over it.
     *
     * The haze is a CONTINUOUS gradient. Quantising it to a handful of alpha levels was an
     * attempt to keep it looking hand-drawn, and it did the opposite: each level change landed on
     * a row boundary and drew a hard full-width edge, so the fog arrived as a stack of grey
     * rectangles across the picture. Nothing in a smooth vertical gradient reads as a photo
     * filter; a staircase of them does.
     *
     * The pixel-art character is carried by the banks instead, which are dithered - they are the
     * part with structure, and structure is what can afford to be stepped.
     */
    fun fog(
        canvas: Canvas, b: RectF, unit: Float, timeMs: Long,
        amount: Float, wind: Float, tint: Int,
    ) {
        if (amount <= 0.02f) return
        val t = timeMs / 1000f
        val h = b.height()
        val w = b.width()
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

        // 1. Base haze, one artwork pixel per row and no quantisation, so consecutive rows differ
        //    by less than one step of alpha and no edge is ever visible.
        var y = b.top + h * 0.16f
        while (y < b.bottom) {
            val a = amount * density(y) * 0.46f
            if (a > 0.002f) {
                paint.alpha = (a * 255f).roundToInt().coerceIn(0, 116)
                canvas.drawRect(b.left, y, b.right, y + unit, paint)
            }
            y += unit
        }

        // 2. Banks: broad, slow, dithered patches that give the fog somewhere to be thicker.
        //    Cells are two pixels square, which keeps the rect count in the low thousands while
        //    staying coarse enough to read as dither rather than as a gradient.
        val cell = unit * 2f
        for (i in 0 until BANKS) {
            val by = b.top + h * (0.30f + hash(i, 13) * 0.50f) + sin(t * 0.19f + i) * h * 0.014f
            val d = density(by)
            if (d <= 0.02f) continue
            val span = w * (0.34f + hash(i, 17) * 0.56f)
            val tall = cell * (3f + hash(i, 31) * 4f)
            val speed = (4f + wind * 26f) * (0.5f + hash(i, 19))
            var x = (hash(i, 23) * (w + span) + t * speed) % (w + span) - span
            val peakA = amount * d * (0.09f + hash(i, 29) * 0.11f)
            val cols = (span / cell).toInt().coerceAtLeast(1)
            val rows = (tall / cell).toInt().coerceAtLeast(1)

            for (c in 0 until cols) {
                val hu = sin((c / cols.toFloat()) * PI_F)
                if (hu <= 0.02f) continue
                val px = b.left + x + c * cell
                if (px < b.left - cell || px > b.right) continue
                for (rIdx in 0 until rows) {
                    val vu = sin(((rIdx + 0.5f) / rows) * PI_F)
                    val a = peakA * hu * hu * vu
                    // Below this there is no fog here, and dithering nothing still draws
                    // something: a fixed bias rounds half the cells up to the lowest level and
                    // lays a checkerboard line along the faint top edge of every bank.
                    if (a < 0.014f) continue
                    // Dither before quantising: snapping straight to levels turned the taper
                    // into flat plateaus with hard edges, which read as rectangles of fog. The
                    // bias fades out with the alpha it is dithering, so it can never invent
                    // texture where the fog itself has none.
                    val bias = (BAYER[(rIdx and 3) * 4 + (c and 3)] / 16f - 0.5f) *
                        (1f / 8f) * (a / 0.10f).coerceAtMost(1f)
                    val stepped = ((a + bias) * 8f).roundToInt() / 8f
                    if (stepped <= 0f) continue
                    paint.alpha = (stepped * 255f).roundToInt().coerceIn(0, 110)
                    val py = by + rIdx * cell
                    canvas.drawRect(px, py, px + cell, py + cell, paint)
                }
            }
        }
    }

    /**
     * How much of the moon-and-stars plane is showing, 0..1.
     *
     * Tracks the sun rather than the clock so it matches the frames, which fade the stars out
     * across dawn and back in through twilight.
     */
    fun moonVisibility(st: SceneState): Float {
        if (!SceneMeta.HAS_MOON) return 0f
        val a = st.sunAltitude()
        return 1f - smooth(-0.22f, 0.06f, a)
    }

    /**
     * Carve the moon's phase out of the painted disc.
     *
     * The moon is drawn full in the artwork - it has to be, since one image cannot hold every
     * night of the month - so the shadow is put back here. Without this every night of the year
     * looks identical, which is the one thing a wallpaper driven by real data should never do.
     *
     * A pixel is lit when it falls on the sunward side of the terminator, whose x at each height
     * is `cos(2*pi*phase) * sqrt(1 - y^2)`: the ellipse you see edge-on as the month turns. At
     * new moon that lands on the disc's edge and nothing is lit; at full it lands on the far edge
     * and all of it is.
     *
     * @param phase position in the synodic month, 0 and 1 new, 0.5 full.
     */
    fun carveMoonPhase(canvas: Canvas, phase: Float, strength: Float, b: RectF, unit: Float) {
        if (!SceneMeta.HAS_MOON || strength <= 0f) return
        val r = SceneMeta.MOON_R
        if (r <= 0) return

        val p = ((phase % 1f) + 1f) % 1f
        val theta = (2.0 * Math.PI * p).toFloat()
        val ct = kotlin.math.cos(theta.toDouble()).toFloat()
        val waxing = p < 0.5f

        paint.color = SHADOW
        paint.alpha = (strength * 238f).roundToInt().coerceIn(0, 255)

        // The disc is a handful of pixels across, so this is a few dozen tests - cheaper than any
        // cleverness, and it never disagrees with the shape the artwork actually drew.
        for (dy in -r..r) {
            for (dx in -r..r) {
                val nx = dx / (r + 0.5f)
                val ny = dy / (r + 0.5f)
                val d2 = nx * nx + ny * ny
                if (d2 > 1f) continue                       // outside the disc
                val edge = kotlin.math.sqrt((1f - ny * ny).coerceAtLeast(0f))
                val terminator = ct * edge
                val lit = if (waxing) nx > terminator else nx < terminator
                if (lit) continue
                block(
                    canvas,
                    b.left + (SceneMeta.MOON_X + dx) * unit,
                    b.top + (SceneMeta.MOON_Y + dy) * unit,
                    unit, unit,
                )
            }
        }
    }

    private fun smooth(e0: Float, e1: Float, x: Float): Float {
        if (e1 <= e0) return if (x >= e1) 1f else 0f
        val t = ((x - e0) / (e1 - e0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
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
