package com.sylcolabs.weatherpaper.scene

import android.graphics.Canvas
import android.graphics.Paint
import java.text.Normalizer
import kotlin.math.roundToInt

/** What the home-screen readout shows and where it sits. Persisted in SharedPreferences. */
internal data class OverlayConfig(
    val enabled: Boolean = true,
    val showClock: Boolean = true,
    val showTemp: Boolean = true,
    val showCondition: Boolean = false,
    val showLocation: Boolean = false,
    val x: Float = 0.5f,
    val y: Float = 0.30f,
    val size: Int = 2,
    val clock24: Boolean = true,
) {
    fun hasContent() = enabled && (showClock || showTemp || showCondition || showLocation)
}

/**
 * The home-screen readout, drawn in the bitmap font over whatever the scene is.
 *
 * Never drawn on the lock screen: the artwork beneath is identical either way, so locking reads
 * as the text fading out rather than the whole scene re-laying-out.
 *
 * Colours here are deliberately neutral - a light ink with a dark outline reads over both a
 * bright sky and a dark canopy without knowing anything about the artwork behind it.
 */
internal object Overlay {

    private const val INK = 0xFFECF0EA.toInt()
    private const val OUTLINE = 0xC8060A08.toInt()

    private val paint = Paint().apply {
        isAntiAlias = false
        isDither = false
        style = Paint.Style.FILL
    }

    /** Fold a place name down to what the font can draw. */
    fun normalise(text: String): String =
        Normalizer.normalize(text.uppercase(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

    fun conditionWord(st: SceneState): String = when {
        st.thunder -> "STORM"
        st.precip == Precipitation.DRIZZLE -> "DRIZZLE"
        st.precip == Precipitation.RAIN || st.precip == Precipitation.HEAVY_RAIN -> "RAIN"
        st.precip == Precipitation.SNOW -> "SNOW"
        st.condition == SkyCondition.FOG -> "FOG"
        st.condition == SkyCondition.OVERCAST -> "OVERCAST"
        st.condition == SkyCondition.PARTLY -> "PARTLY"
        else -> "CLEAR"
    }

    fun clockText(st: SceneState, clock24: Boolean): String {
        val h = st.hour.toInt() % 24
        val m = ((st.hour - st.hour.toInt()) * 60f).toInt().coerceIn(0, 59)
        val mm = if (m < 10) "0$m" else "$m"
        if (clock24) return (if (h < 10) "0$h" else "$h") + ":" + mm
        val h12 = if (h % 12 == 0) 12 else h % 12
        return "$h12:$mm"
    }

    private class Line(val text: String, val bump: Int)

    private fun lines(st: SceneState, cfg: OverlayConfig): List<Line> {
        val out = ArrayList<Line>(3)
        if (cfg.showClock) out.add(Line(clockText(st, cfg.clock24), 1))

        val second = StringBuilder()
        if (cfg.showTemp && st.tempC != null) second.append(st.tempC.roundToInt()).append('°')
        if (cfg.showCondition) {
            if (second.isNotEmpty()) second.append(' ')
            second.append(conditionWord(st))
        }
        if (second.isNotEmpty()) out.add(Line(second.toString(), 0))

        if (cfg.showLocation && !st.place.isNullOrBlank()) out.add(Line(normalise(st.place), 0))
        return out
    }

    /**
     * Draw one string, with a 1px dark outline so it stays legible over anything.
     *
     * @param unit size of one font pixel in screen pixels, so the text stays on the same grid as
     *             the artwork rather than being independently scaled.
     */
    fun drawText(canvas: Canvas, text: String, left: Float, top: Float, unit: Float) {
        val fw = PixelFont.WIDTH
        val fh = PixelFont.HEIGHT
        val cols = text.length * PixelFont.ADVANCE
        val mask = BooleanArray(cols * fh)

        for (i in text.indices) {
            val g = PixelFont.glyph(text[i])
            for (gy in 0 until fh) for (gx in 0 until fw) {
                if (PixelFont.ink(g, gx, gy)) mask[gy * cols + i * PixelFont.ADVANCE + gx] = true
            }
        }

        fun cell(cx: Int, cy: Int) {
            val x = left + cx * unit
            val y = top + cy * unit
            canvas.drawRect(x, y, x + unit, y + unit, paint)
        }

        paint.color = OUTLINE
        for (cy in 0 until fh) for (cx in 0 until cols) {
            if (mask[cy * cols + cx]) continue
            var near = false
            outer@ for (dy in -1..1) for (dx in -1..1) {
                val nx = cx + dx; val ny = cy + dy
                if (nx in 0 until cols && ny in 0 until fh && mask[ny * cols + nx]) { near = true; break@outer }
            }
            if (near) cell(cx, cy)
        }
        paint.color = INK
        for (cy in 0 until fh) for (cx in 0 until cols) if (mask[cy * cols + cx]) cell(cx, cy)
    }

    /**
     * @param bounds the artwork's rectangle on screen, which the readout positions itself within.
     * @param unit size of one artwork pixel in screen pixels.
     */
    fun draw(canvas: Canvas, st: SceneState, cfg: OverlayConfig, bounds: android.graphics.RectF, unit: Float) {
        if (!cfg.hasContent()) return
        val ls = lines(st, cfg)
        if (ls.isEmpty()) return

        val size = cfg.size.coerceIn(1, 4)
        val gap = 3f * size * unit

        var total = 0f
        for (l in ls) total += PixelFont.HEIGHT * (size + l.bump) * unit + gap
        total -= gap

        var y = bounds.top + cfg.y.coerceIn(0f, 1f) * bounds.height() - total / 2f
        for (l in ls) {
            val sc = size + l.bump
            val w = PixelFont.width(l.text, sc) * unit
            val x = bounds.left + cfg.x.coerceIn(0f, 1f) * bounds.width() - w / 2f
            drawText(canvas, l.text, x, y, sc * unit)
            y += PixelFont.HEIGHT * sc * unit + gap
        }
    }
}
