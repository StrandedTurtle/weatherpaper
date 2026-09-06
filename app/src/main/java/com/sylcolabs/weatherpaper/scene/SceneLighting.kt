package com.sylcolabs.weatherpaper.scene

import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Turns the weather into light.
 *
 * The artwork is a single clear night, so nothing here repaints it - every effect is a colour
 * transform over the plane it belongs to. That keeps the whole day and weather range inside one
 * set of nine PNGs, and it means the depth planes earn their keep: fog is applied per plane by
 * distance, which is what aerial perspective actually is.
 *
 * Everything is a pure function of [SceneState], so two callers with the same state - the
 * wallpaper and the settings preview - cannot drift apart.
 */
internal object SceneLighting {

    /** The scene's own horizon haze, which is what distance washes toward at night. */
    private const val FOG_NIGHT_R = 0x2e
    private const val FOG_NIGHT_G = 0x3c
    private const val FOG_NIGHT_B = 0x39

    /** Daylight fog is paler and flatter. */
    private const val FOG_DAY_R = 0xa8
    private const val FOG_DAY_G = 0xb2
    private const val FOG_DAY_B = 0xad

    /** How far a plane at the very back is pushed toward the fog colour in thick fog. */
    private const val FOG_MAX = 0.82f

    /**
     * 0 in the dark, 1 in full daylight.
     *
     * The artwork is a night scene, so daylight lifts and flattens it rather than replacing it.
     * A dense conifer floor at noon is genuinely dim, which is why that reads.
     */
    fun daylight(st: SceneState): Float {
        val alt = st.sunAltitude()
        return smoothstep(-0.10f, 0.45f, alt)
    }

    /** 1 through the half hour either side of the horizon, 0 well away from it. */
    fun twilight(st: SceneState): Float {
        val alt = st.sunAltitude()
        return (1f - min(1f, abs(alt) / 0.22f)).coerceIn(0f, 1f)
    }

    /**
     * How much the air is carrying, 0..1.
     *
     * Fog is the obvious case, but heavy rain and snow both close the distance down too, and
     * overcast flattens it a little even when nothing is falling.
     */
    fun haze(st: SceneState): Float {
        val base = when (st.condition) {
            SkyCondition.FOG -> 0.90f
            SkyCondition.OVERCAST -> 0.26f
            SkyCondition.PARTLY -> 0.10f
            SkyCondition.CLEAR -> 0.02f
        }
        val fromPrecip = when (st.precip) {
            Precipitation.NONE -> 0f
            Precipitation.DRIZZLE -> 0.16f
            Precipitation.RAIN -> 0.28f
            Precipitation.HEAVY_RAIN -> 0.45f
            Precipitation.SNOW -> 0.40f
        }
        return min(1f, base + fromPrecip)
    }

    /** Illuminated fraction, 0 new to 1 full. [SceneState.moonPhase] is a position in the cycle. */
    fun moonIllumination(st: SceneState): Float = 1f - abs(2f * st.moonPhase - 1f)

    /**
     * The colour transform for one plane.
     *
     * @param depth 0 infinitely far, 1 against the lens.
     * @return null when the plane should be drawn untouched, which is the common case on a clear
     *         night and lets the renderer skip the filter entirely.
     */
    fun filterFor(st: SceneState, depth: Float): ColorMatrixColorFilter? {
        val day = daylight(st)
        val fog = haze(st)
        val moon = moonIllumination(st)

        // Aerial perspective: the back of the scene goes first, but in thick fog even the
        // nearest leaves lose a little contrast.
        val wash = (fog * (0.12f + 0.88f * (1f - depth)) * FOG_MAX).coerceIn(0f, 1f)

        // Brightness. Daylight lifts; cloud and a thin moon take it back.
        var k = 1f + 0.60f * day
        k *= 1f - 0.16f * st.cloud
        if (day < 0.5f) k *= 0.80f + 0.20f * moon      // moonlight only matters after dark

        val fr = lerp(FOG_NIGHT_R.toFloat(), FOG_DAY_R.toFloat(), day)
        val fg = lerp(FOG_NIGHT_G.toFloat(), FOG_DAY_G.toFloat(), day)
        val fb = lerp(FOG_NIGHT_B.toFloat(), FOG_DAY_B.toFloat(), day)

        // Twilight puts a little warmth back into whatever the sun is still touching.
        val warm = twilight(st) * (1f - fog) * 0.10f

        val scale = k * (1f - wash)
        val tr = wash * fr + warm * 40f
        val tg = wash * fg + warm * 18f
        val tb = wash * fb - warm * 6f

        val untouched = abs(scale - 1f) < 0.012f && tr < 1.2f && tg < 1.2f && abs(tb) < 1.2f
        if (untouched) return null

        return ColorMatrixColorFilter(
            ColorMatrix(
                floatArrayOf(
                    scale, 0f, 0f, 0f, tr,
                    0f, scale, 0f, 0f, tg,
                    0f, 0f, scale, 0f, tb,
                    0f, 0f, 0f, 1f, 0f,
                )
            )
        )
    }

    /**
     * Opacity for one plane, 0..255.
     *
     * Only the stars need it: they are the one thing in the artwork that is not there in daylight,
     * and they go behind cloud and fog too.
     */
    fun alphaFor(name: String, st: SceneState): Int {
        if (name != "stars") return 255
        val visible = (1f - st.cloud).pow(1.6f) * (1f - haze(st)) * (1f - daylight(st))
        return (visible.coerceIn(0f, 1f) * 255f).toInt()
    }

    /**
     * How brightly the cabin window is lit, 0..1.
     *
     * The artwork's cabin is dark, so this is drawn on rather than painted in - which is what lets
     * it answer to the weather. Someone is home, and they turn the lamp up when it is filthy out.
     */
    fun windowGlow(st: SceneState): Float {
        val dark = 1f - daylight(st)
        if (dark <= 0.02f) return 0f
        val rough = max(st.cloud, haze(st))
        val falling = if (st.precip != Precipitation.NONE) 0.25f else 0f
        return (dark * (0.55f + 0.35f * rough + falling)).coerceIn(0f, 1f)
    }

    private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

    private fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
        if (edge1 <= edge0) return if (x >= edge1) 1f else 0f
        val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }
}
