package com.sylcolabs.weatherpaper.scene

import android.graphics.Bitmap
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Draws the scene, and knows what it can avoid redrawing.
 *
 * The expensive passes - sky, the distant treeline, the clearing floor and pool, and each
 * swaying tree layer - are rendered into cached buffers that are rebuilt only when the weather
 * state actually changes. A frame is then four buffer copies at their sway offsets plus the
 * live weather effects, which is what makes a 12fps loop cost almost nothing.
 *
 * Cached: backdrop (sky + far treeline + ground + pool) and the mid, near and framing layers.
 * Live:   stars, cloud drift, fog, precipitation, lightning, and the home-screen readout.
 */
internal class SceneRenderer {

    private var w = 0
    private var h = 0
    private var cachedKey = Int.MIN_VALUE

    private var backdrop: PixelBuffer? = null
    private var work: PixelBuffer? = null
    private var swayLayers: Array<PixelBuffer> = emptyArray()
    private var bitmap: Bitmap? = null
    private var context: SceneContext? = null

    val virtualWidth get() = w
    val virtualHeight get() = h

    fun resize(width: Int, height: Int) {
        if (width == w && height == h && bitmap != null) return
        release()
        w = width
        h = height
        if (w <= 0 || h <= 0) return
        backdrop = PixelBuffer(w, h)
        work = PixelBuffer(w, h)
        swayLayers = Array(SWAY_LAYERS.size) { PixelBuffer(w, h) }
        bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        cachedKey = Int.MIN_VALUE
    }

    fun release() {
        bitmap?.recycle()
        bitmap = null
        backdrop = null
        work = null
        swayLayers = emptyArray()
        context = null
        cachedKey = Int.MIN_VALUE
    }

    /** Force the next render to rebuild the cached layers (used when settings change). */
    fun invalidate() { cachedKey = Int.MIN_VALUE }

    private fun rebuild(state: SceneState) {
        val bd = backdrop ?: return
        val ctx = SceneContext(state, w, h)
        context = ctx

        bd.clear()
        Sky.draw(bd, ctx)
        Sky.drawCelestial(bd, ctx, state.moonPhase)
        Forest.drawLayer(bd, ctx, 0, 0f)     // distant treeline: too far away to sway visibly
        Forest.drawGround(bd, ctx)
        Forest.drawPool(bd, ctx)

        for (i in SWAY_LAYERS.indices) {
            val buf = swayLayers[i]
            buf.clear()
            Forest.drawLayer(buf, ctx, SWAY_LAYERS[i], 0f)
        }
        cachedKey = state.cacheKey()
    }

    /** Sway plus home-screen parallax, as one horizontal offset per layer. */
    private fun offsetFor(layerIndex: Int, timeMs: Long, wind: Float, slide: Float): Int {
        val layer = Art.LAYERS[layerIndex]
        val sway = sin(timeMs / 1000f * (0.32f + layerIndex * 0.11f) + layerIndex * 1.7f) *
            layer.sway * (0.35f + wind * 4.2f)
        val parallax = slide * layer.parallax * w * 0.07f
        return (sway + parallax).roundToInt()
    }

    private fun composite(dst: PixelBuffer, src: PixelBuffer, dx: Int) {
        for (y in 0 until dst.h) {
            val row = y * dst.w
            for (x in 0 until dst.w) {
                val sx = x - dx
                if (sx < 0 || sx >= src.w) continue
                val s = src.px[row + sx]
                if (s ushr 24 != 0) dst.px[row + x] = s
            }
        }
    }

    /**
     * Render one frame and return the scene bitmap, or null if there is no surface yet.
     *
     * @param slide home-screen scroll offset, -1..1, from onOffsetsChanged.
     * @param locked true on the lock screen, where the readout is not drawn.
     */
    fun render(
        state: SceneState,
        timeMs: Long,
        slide: Float,
        locked: Boolean,
        overlay: OverlayConfig,
    ): Bitmap? {
        val bd = backdrop ?: return null
        val wk = work ?: return null
        val bmp = bitmap ?: return null

        if (state.cacheKey() != cachedKey) rebuild(state)
        val ctx = context ?: return null

        System.arraycopy(bd.px, 0, wk.px, 0, bd.px.size)

        Sky.drawStars(wk, ctx, timeMs)
        Weather.drawClouds(wk, ctx, state, timeMs)

        for (i in SWAY_LAYERS.indices) {
            composite(wk, swayLayers[i], offsetFor(SWAY_LAYERS[i], timeMs, state.wind, slide))
        }

        val fog = when {
            state.condition == SkyCondition.FOG -> 0.85f
            state.precip != Precipitation.NONE -> 0.16f
            else -> 0f
        }
        Weather.drawFog(wk, ctx, state, timeMs, fog)
        Weather.drawPrecip(wk, ctx, state, timeMs)
        if (state.thunder) Weather.drawLightning(wk, ctx, Weather.lightningAlpha(timeMs))

        // Home screen only. On the lock screen this pass is simply skipped.
        if (!locked) Overlay.draw(wk, ctx, state, overlay)

        bmp.setPixels(wk.px, 0, w, 0, 0, w, h)
        return bmp
    }

    private companion object {
        /** Layer indices that sway; layer 0 (the distant treeline) is baked into the backdrop. */
        val SWAY_LAYERS = intArrayOf(1, 2, 3)
    }
}
