package com.sylcolabs.weatherpaper.scene

import kotlin.math.pow
import kotlin.math.sin

/**
 * What, if anything, is moving.
 *
 * The scene is still by default and only animates when the weather gives it a reason to, which is
 * what keeps a live wallpaper from costing anything on a calm clear day. Each layer carries a wind
 * *susceptibility* rather than an amplitude, so one number in the manifest covers dead calm
 * through a gale.
 */
internal object SceneMotion {

    /** How far the most wind-exposed plane travels at full gale, in artwork pixels. */
    private const val MAX_SWAY_PX = 2.2f

    /** Below this the movement is under half a screen pixel, so it is not worth a redraw loop. */
    private const val MIN_VISIBLE_PX = 0.30f

    /** Sway available to a fully exposed plane, in artwork pixels. */
    fun windAmplitude(st: SceneState): Float = MAX_SWAY_PX * st.wind.coerceIn(0f, 1f).pow(1.25f)

    /**
     * Horizontal offset for one layer, in artwork pixels.
     *
     * Two rates, not one: a slow gust riding under a quicker rustle. A single sine reads as a
     * metronome, which is the thing that makes cheap parallax look cheap.
     */
    fun offsetFor(layer: Layers.Layer, index: Int, timeMs: Long, st: SceneState): Float {
        val amp = layer.wind * windAmplitude(st) + layer.sway
        if (amp <= 0.001f) return 0f
        val t = timeMs / 1000f
        val rustle = sin(t * (0.55f + index * 0.045f) + index * 1.7f)
        val gust = sin(t * (0.17f + index * 0.013f) + index * 0.9f)
        return (rustle * 0.62f + gust * 0.38f) * amp
    }

    /**
     * Whether the scene needs a redraw loop at all.
     *
     * Checked per frame against the live weather rather than baked into the manifest, so the
     * wallpaper drops back to drawing nothing the moment the wind dies.
     */
    fun animates(st: SceneState): Boolean {
        if (Layers.hasIdleMotion) return true
        if (st.precip != Precipitation.NONE || st.thunder) return true
        return Layers.respondsToWind && windAmplitude(st) >= MIN_VISIBLE_PX
    }
}
