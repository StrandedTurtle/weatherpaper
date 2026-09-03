package com.sylcolabs.weatherpaper.scene

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Composites the scene: the imported layers, back to front, then the readout.
 *
 * It knows nothing about what the artwork depicts. The canvas size comes from the images
 * themselves, they are scaled by a whole number so pixels stay square, and the result is
 * cropped to the screen. Per-layer parallax and drift are read from the manifest and are zero
 * until they are deliberately set.
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

    /** Horizontal offset for a layer, in screen pixels: home-screen parallax plus idle drift. */
    private fun offsetFor(layer: Layers.Layer, index: Int, timeMs: Long, slide: Float): Int {
        var px = slide * layer.parallax
        if (layer.sway != 0f) {
            px += sin(timeMs / 1000f * (0.3f + index * 0.07f) + index * 1.7f) * layer.sway
        }
        return (px * unit).roundToInt()
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

            for (i in Layers.ALL.indices) {
                val bmp = bitmaps.getOrNull(i) ?: continue
                if (bmp.isRecycled) continue
                val dx = offsetFor(Layers.ALL[i], i, timeMs, slide)
                dst.set(
                    (bounds.left.roundToInt() + dx),
                    bounds.top.roundToInt(),
                    (bounds.right.roundToInt() + dx),
                    bounds.bottom.roundToInt(),
                )
                canvas.drawBitmap(bmp, src, dst, blit)
            }
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
