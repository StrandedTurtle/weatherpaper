package com.sylcolabs.weatherpaper.scene

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Composites the scene: the imported layers, back to front, then the readout.
 *
 * It knows nothing about what the artwork depicts. The canvas size comes from the images
 * themselves, they are scaled by a whole number so pixels stay square, and the result is
 * cropped to the screen.
 *
 * What the weather does to it lives in [SceneLighting] (colour), [SceneMotion] (wind) and
 * [SceneEffects] (precipitation, lightning, the cabin lamp) - all pure functions of the state, so
 * the settings preview and the wallpaper cannot show different scenes.
 */
internal class SceneRenderer(private val context: Context) {

    private var bitmaps: Array<Bitmap?> = emptyArray()
    private var loaded = false

    private var screenW = 0
    private var screenH = 0

    /** Screen pixels per artwork pixel. Always a whole number, which is what keeps pixels square. */
    var unit = 1
        private set

    /** Where the artwork sits on screen once scaled; may extend past the edges. */
    private val bounds = RectF()
    private val src = Rect()
    private val dst = Rect()

    private val blit = Paint().apply {
        isFilterBitmap = false
        isAntiAlias = false
        isDither = false
    }
    private val fill = Paint()

    val hasArt: Boolean get() = !Layers.isEmpty && Layers.WIDTH > 0 && Layers.HEIGHT > 0

    private fun load() {
        if (loaded) return
        loaded = true
        if (Layers.isEmpty) return
        // inScaled = false: decode at the artwork's own size, ignoring screen density.
        val opts = BitmapFactory.Options().apply {
            inScaled = false
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        bitmaps = Array(Layers.ALL.size) { i ->
            runCatching { BitmapFactory.decodeResource(context.resources, Layers.ALL[i].resId, opts) }.getOrNull()
        }
    }

    fun resize(width: Int, height: Int) {
        screenW = width
        screenH = height
        if (width <= 0 || height <= 0) return
        load()

        if (!hasArt) {
            unit = 1
            bounds.set(0f, 0f, width.toFloat(), height.toFloat())
            return
        }

        // Scale up by a whole number until the artwork covers the screen, then crop.
        unit = max(1, ceil(max(width.toDouble() / Layers.WIDTH, height.toDouble() / Layers.HEIGHT)).toInt())
        val w = Layers.WIDTH * unit
        val h = Layers.HEIGHT * unit
        val left = ((width - w) / 2f)
        val top = if (Layers.ANCHOR_BOTTOM) (height - h).toFloat() else ((height - h) / 2f)
        bounds.set(left, top, left + w, top + h)
        src.set(0, 0, Layers.WIDTH, Layers.HEIGHT)
    }

    fun release() {
        for (b in bitmaps) b?.recycle()
        bitmaps = emptyArray()
        loaded = false
    }

    /** Horizontal offset for a layer, in screen pixels: parallax plus whatever the wind is doing. */
    private fun offsetFor(layer: Layers.Layer, index: Int, timeMs: Long, slide: Float, st: SceneState): Int {
        val px = slide * layer.parallax + SceneMotion.offsetFor(layer, index, timeMs, st)
        return (px * unit).roundToInt()
    }

    /**
     * Per-plane colour filters, rebuilt only when the light actually changes.
     *
     * The scene sits on one state for minutes at a time, so the filters are cached against a
     * coarse signature of it: without that, an animating frame would allocate nine
     * ColorMatrixColorFilters twelve times a second to say the same thing each time.
     */
    private var filters: Array<ColorMatrixColorFilter?> = emptyArray()
    private var filterKey = Int.MIN_VALUE

    private fun lightingKey(st: SceneState): Int {
        var k = (SceneLighting.daylight(st) * 64f).toInt()
        k = k * 67 + (SceneLighting.haze(st) * 64f).toInt()
        k = k * 67 + (st.cloud * 32f).toInt()
        k = k * 67 + (SceneLighting.moonIllumination(st) * 16f).toInt()
        k = k * 67 + (SceneLighting.twilight(st) * 32f).toInt()
        return k
    }

    private fun ensureFilters(st: SceneState) {
        val key = lightingKey(st)
        if (key == filterKey && filters.size == Layers.ALL.size) return
        filterKey = key
        filters = Array(Layers.ALL.size) { SceneLighting.filterFor(st, Layers.ALL[it].depth) }
    }

    /**
     * Draw one frame.
     *
     * @param slide home-screen scroll offset, -1..1, from onOffsetsChanged.
     * @param locked true on the lock screen, where the readout is not drawn.
     */
    fun render(
        canvas: Canvas,
        state: SceneState,
        timeMs: Long,
        slide: Float,
        locked: Boolean,
        overlay: OverlayConfig,
    ) {
        if (screenW <= 0 || screenH <= 0) return
        load()

        if (!hasArt) {
            drawPlaceholder(canvas)
        } else {
            // Fill first: a layer sliding on parallax can expose the edge behind it.
            fill.color = BACKDROP
            canvas.drawRect(0f, 0f, screenW.toFloat(), screenH.toFloat(), fill)

            ensureFilters(state)
            val glow = SceneLighting.windowGlow(state)

            for (i in Layers.ALL.indices) {
                val layer = Layers.ALL[i]
                val bmp = bitmaps.getOrNull(i) ?: continue
                if (bmp.isRecycled) continue
                val dx = offsetFor(layer, i, timeMs, slide, state)
                dst.set(
                    (bounds.left.roundToInt() + dx),
                    bounds.top.roundToInt(),
                    (bounds.right.roundToInt() + dx),
                    bounds.bottom.roundToInt(),
                )
                val alpha = SceneLighting.alphaFor(layer.name, state)
                if (alpha > 0) {
                    blit.colorFilter = filters.getOrNull(i)
                    blit.alpha = alpha
                    canvas.drawBitmap(bmp, src, dst, blit)
                    blit.colorFilter = null
                    blit.alpha = 255
                }
                // Light the window as soon as the cabin is down, so the near foliage and any
                // weather still pass in front of it.
                if (layer.name == "cabin") SceneEffects.drawWindowGlow(canvas, glow, bounds, unit.toFloat())
            }

            SceneEffects.drawPrecipitation(canvas, state, timeMs, bounds, unit.toFloat())
            SceneEffects.drawLightning(canvas, SceneEffects.lightning(state, timeMs), screenW, screenH)
        }

        // Home screen only. On the lock screen this pass is simply skipped.
        if (!locked) {
            Overlay.draw(canvas, state, overlay, bounds, if (hasArt) unit.toFloat() else placeholderUnit())
        }
    }

    private fun placeholderUnit(): Float = max(1f, screenH / 280f)

    /**
     * Shown until artwork is imported: a flat ground with a marker, so an install without art is
     * obviously waiting for something rather than looking broken.
     */
    private fun drawPlaceholder(canvas: Canvas) {
        fill.color = BACKDROP
        canvas.drawRect(0f, 0f, screenW.toFloat(), screenH.toFloat(), fill)
        val u = placeholderUnit()
        val text = "NO ART IMPORTED"
        val w = PixelFont.width(text, 1) * u
        Overlay.drawText(canvas, text, (screenW - w) / 2f, screenH * 0.46f, u)
    }

    private companion object {
        /** Neutral dark ground behind the artwork. Not a design choice about the scene itself. */
        const val BACKDROP = 0xFF101314.toInt()
    }
}
