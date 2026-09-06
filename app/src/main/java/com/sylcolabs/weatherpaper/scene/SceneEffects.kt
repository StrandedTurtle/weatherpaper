package com.sylcolabs.weatherpaper.scene

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.sin

/**
 * The things the weather draws on top of the artwork: precipitation, lightning, and the lamp in
 * the cabin window.
 *
 * Everything is placed from a hash of the particle's index rather than a stored particle list, so
 * there is nothing to allocate, nothing to seed, and no state to keep between frames - the same
 * millisecond always produces the same frame. Drops are drawn as whole artwork pixels so they sit
 * on the same grid as the scene instead of floating over it at screen resolution.
 */
internal object SceneEffects {

    private val paint = Paint().apply {
        isAntiAlias = false
        isDither = false
        style = Paint.Style.FILL
    }

    /** Deterministic 0..1 from an index. */
    private fun rnd(i: Int, salt: Int): Float {
        var h = i * 374761393 + salt * 668265263
        h = (h xor (h ushr 13)) * 1274126177
        h = h xor (h ushr 16)
        return ((h ushr 8) and 0xFFFF).toFloat() / 65535f
    }

    private fun countFor(precip: Precipitation): Int = when (precip) {
        Precipitation.NONE -> 0
        Precipitation.DRIZZLE -> 70
        Precipitation.RAIN -> 150
        Precipitation.HEAVY_RAIN -> 260
        Precipitation.SNOW -> 120
    }

    /**
     * Rain or snow over the whole frame.
     *
     * @param bounds where the artwork sits on screen.
     * @param unit screen pixels per artwork pixel, so a drop is a pixel and not a smear.
     */
    fun drawPrecipitation(canvas: Canvas, st: SceneState, timeMs: Long, bounds: RectF, unit: Float) {
        val count = countFor(st.precip)
        if (count == 0) return

        val w = Layers.WIDTH.toFloat()
        val h = Layers.HEIGHT.toFloat()
        val t = timeMs / 1000f
        val snow = st.precip == Precipitation.SNOW
        // Wind blows the fall sideways; snow is far more easily pushed than rain.
        val drift = st.wind * (if (snow) 26f else 14f)
        val fall = if (snow) 11f else 130f
        val visibility = 1f - 0.45f * SceneLighting.haze(st)

        for (i in 0 until count) {
            val depth = rnd(i, 1)                       // 0 far, 1 near
            val speed = fall * (0.55f + 0.75f * depth)
            val lane = rnd(i, 2) * w
            var x = lane + (drift * t * (0.4f + depth))
            var y = (rnd(i, 3) * h + speed * t) % h
            if (snow) x += sin(t * 0.7f + i) * (1.4f + depth)
            x = ((x % w) + w) % w

            val len = if (snow) 1f else 2f + 3f * depth
            val a = ((if (snow) 0.55f else 0.42f) + 0.45f * depth) * visibility
            paint.color = if (snow) 0xFFE4EAE6.toInt() else 0xFFA8B8BC.toInt()
            paint.alpha = (a.coerceIn(0f, 1f) * 255f).toInt()

            val sx = bounds.left + x * unit
            val sy = bounds.top + y * unit
            val thick = if (depth > 0.72f && !snow) unit * 2f else unit
            canvas.drawRect(sx, sy, sx + thick, sy + len * unit, paint)
        }
    }

    /**
     * Flash intensity, 0..1.
     *
     * Strikes are picked from the clock rather than a timer, so the flash is identical whether the
     * frame arrives on time or late, and nothing has to be kept between frames.
     */
    fun lightning(st: SceneState, timeMs: Long): Float {
        if (!st.thunder) return 0f
        val period = 5400L
        val window = (timeMs / period).toInt()
        if (rnd(window, 77) > 0.5f) return 0f          // most windows pass without one
        return when (timeMs % period) {
            in 0L until 60L -> 1.00f
            in 60L until 110L -> 0.22f
            in 110L until 175L -> 0.70f
            in 175L until 250L -> 0.14f
            else -> 0f
        }
    }

    fun drawLightning(canvas: Canvas, intensity: Float, screenW: Int, screenH: Int) {
        if (intensity <= 0f) return
        paint.color = 0xFFDCE8F0.toInt()
        paint.alpha = (intensity * 0.42f * 255f).toInt()
        canvas.drawRect(0f, 0f, screenW.toFloat(), screenH.toFloat(), paint)
    }

    /**
     * The lamp in the cabin window.
     *
     * The artwork's cabin is dark, so this is the one place light is added rather than filtered.
     * Drawn straight after the cabin plane, so the near foliage still passes in front of it.
     */
    fun drawWindowGlow(canvas: Canvas, glow: Float, bounds: RectF, unit: Float) {
        if (glow <= 0.01f || !SceneMeta.PRESENT) return
        for (win in SceneMeta.WINDOWS) {
            val x = bounds.left + win[0] * unit
            val y = bounds.top + win[1] * unit
            val w = win[2] * unit
            val h = win[3] * unit
            // A soft surround first, so the light looks like it is coming through glass.
            paint.color = 0xFFFFC46A.toInt()
            paint.alpha = (glow * 0.28f * 255f).toInt()
            canvas.drawRect(x - unit, y - unit, x + w + unit, y + h + unit, paint)
            paint.alpha = (glow * 0.92f * 255f).toInt()
            canvas.drawRect(x, y, x + w, y + h, paint)
        }
    }
}
