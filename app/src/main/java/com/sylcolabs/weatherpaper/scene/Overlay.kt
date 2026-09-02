package com.sylcolabs.weatherpaper.scene

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
 * The home-screen readout.
 *
 * Never drawn on the lock screen: the forest beneath is identical either way, so locking reads
 * as the text fading out rather than the whole scene re-laying-out.
 */
internal object Overlay {

    private const val INK = 0xECF0EA
    private const val OUTLINE = 0x060A08

    /** Fold a place name down to what the 5x7 font can draw. */
    fun normalise(text: String): String =
        Normalizer.normalize(text.uppercase(), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")

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
     * Draw a string with a 1px dark outline. The outline is what keeps the readout legible over
     * both a bright noon sky and a near-black night canopy, with no panel muddying the art.
     */
    fun drawText(buf: PixelBuffer, text: String, x: Int, y: Int, scale: Int, ink: Int, outline: Int) {
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

        fun block(cx: Int, cy: Int, colour: Int, alpha: Float) {
            for (sy in 0 until scale) for (sx in 0 until scale) {
                buf.blend(x + cx * scale + sx, y + cy * scale + sy, colour, alpha)
            }
        }

        for (cy in 0 until fh) for (cx in 0 until cols) {
            if (mask[cy * cols + cx]) continue
            var near = false
            outer@ for (dy in -1..1) for (dx in -1..1) {
                val nx = cx + dx; val ny = cy + dy
                if (nx in 0 until cols && ny in 0 until fh && mask[ny * cols + nx]) { near = true; break@outer }
            }
            if (near) block(cx, cy, outline, 0.78f)
        }
        for (cy in 0 until fh) for (cx in 0 until cols) {
            if (mask[cy * cols + cx]) block(cx, cy, ink, 1f)
        }
    }

    fun draw(buf: PixelBuffer, ctx: SceneContext, st: SceneState, cfg: OverlayConfig) {
        if (!cfg.hasContent()) return
        val ls = lines(st, cfg)
        if (ls.isEmpty()) return

        val size = cfg.size.coerceIn(1, 4)
        val ink = Colour.mix(INK, Colour.tint(INK, ctx.tintR, ctx.tintG, ctx.tintB), 0.45f)
        val gap = 3 * size

        var total = 0
        for (l in ls) total += PixelFont.HEIGHT * (size + l.bump) + gap
        total -= gap

        var y = (cfg.y.coerceIn(0f, 1f) * buf.h - total / 2f).roundToInt()
        for (l in ls) {
            val sc = size + l.bump
            val w = PixelFont.width(l.text, sc)
            val x = (cfg.x.coerceIn(0f, 1f) * buf.w - w / 2f).roundToInt()
            drawText(buf, l.text, x, y, sc, ink, OUTLINE)
            y += PixelFont.HEIGHT * sc + gap
        }
    }
}
