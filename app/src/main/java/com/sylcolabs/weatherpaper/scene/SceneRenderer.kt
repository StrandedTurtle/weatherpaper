package com.sylcolabs.weatherpaper.scene

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Draws the scene: the time-of-day artwork, graded for cloud, with live weather over it.
 *
 * The artwork is a set of complete frames, each relit offline from the source planes by
 * art/relight.js. Lighting is therefore a property of the art rather than a filter applied at
 * runtime - a colour matrix cannot know that the sky wants to go blue while the canopy goes
 * green, which is why a single night image lifted toward day always read flat.
 *
 * What is left at runtime is what genuinely has to be: which two frames to blend, how far
 * between them, and the weather on top.
 */
internal class SceneRenderer(private val context: Context) {

    private var loIndex = -1
    private var hiIndex = -1
    private var loBitmap: Bitmap? = null
    private var hiBitmap: Bitmap? = null

    private var screenW = 0
    private var screenH = 0

    /** Screen pixels per artwork pixel. Always whole, which is what keeps pixels square. */
    var unit = 1
        private set

    private val bounds = RectF()
    private val src = Rect()
    private val dst = Rect()

    private val basePaint = Paint().apply {
        isFilterBitmap = false; isAntiAlias = false; isDither = false
    }
    private val blendPaint = Paint().apply {
        isFilterBitmap = false; isAntiAlias = false; isDither = false
    }
    private val fill = Paint()
    private var gradedFor = -1f

    val hasArt: Boolean get() = !Frames.isEmpty && Frames.WIDTH > 0 && Frames.HEIGHT > 0

    fun resize(width: Int, height: Int) {
        screenW = width
        screenH = height
        if (width <= 0 || height <= 0) return

        if (!hasArt) {
            unit = 1
            bounds.set(0f, 0f, width.toFloat(), height.toFloat())
            return
        }
        unit = max(1, ceil(max(width.toDouble() / Frames.WIDTH, height.toDouble() / Frames.HEIGHT)).toInt())
        val w = Frames.WIDTH * unit
        val h = Frames.HEIGHT * unit
        val left = (width - w) / 2f
        val top = if (Frames.ANCHOR_BOTTOM) (height - h).toFloat() else (height - h) / 2f
        bounds.set(left, top, left + w, top + h)
        src.set(0, 0, Frames.WIDTH, Frames.HEIGHT)
        dst.set(left.roundToInt(), top.roundToInt(), (left + w).roundToInt(), (top + h).roundToInt())
    }

    /**
     * Only the two frames in view are held. The bracket shifts a handful of times a day, so
     * re-decoding on the change costs far less than keeping every frame resident.
     */
    private fun ensureFrames(lo: Int, hi: Int) {
        if (lo == loIndex && hi == hiIndex) return
        val opts = BitmapFactory.Options().apply {
            inScaled = false
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        fun decode(i: Int): Bitmap? =
            runCatching { BitmapFactory.decodeResource(context.resources, Frames.ALL[i].resId, opts) }.getOrNull()

        // Advancing through the day usually shifts hi into lo, so reuse rather than re-decode.
        val newLo = if (lo == hiIndex) hiBitmap else if (lo == loIndex) loBitmap else decode(lo)
        val newHi = if (hi == loIndex) loBitmap else if (hi == hiIndex) hiBitmap else decode(hi)
        if (loBitmap !== newLo && loBitmap !== newHi) loBitmap?.recycle()
        if (hiBitmap !== newLo && hiBitmap !== newHi) hiBitmap?.recycle()
        loBitmap = newLo
        hiBitmap = newHi
        loIndex = lo
        hiIndex = hi
    }

    /** Cloud drains colour and light. The one grade still worth doing at runtime. */
    private fun grade(cloud: Float) {
        if (abs(cloud - gradedFor) < 0.02f) return
        gradedFor = cloud
        if (cloud <= 0.02f) {
            basePaint.colorFilter = null
            blendPaint.colorFilter = null
            return
        }
        val dim = 1f - 0.22f * cloud
        val m = ColorMatrix().apply { setSaturation(1f - 0.55f * cloud) }
        m.postConcat(ColorMatrix(floatArrayOf(
            dim, 0f, 0f, 0f, 0f,
            0f, dim, 0f, 0f, 0f,
            0f, 0f, dim * 1.02f, 0f, 0f,   // a touch of blue left in, so overcast reads cold
            0f, 0f, 0f, 1f, 0f,
        )))
        val filter = ColorMatrixColorFilter(m)
        basePaint.colorFilter = filter
        blendPaint.colorFilter = filter
    }

    fun release() {
        loBitmap?.recycle()
        if (hiBitmap !== loBitmap) hiBitmap?.recycle()
        loBitmap = null
        hiBitmap = null
        loIndex = -1
        hiIndex = -1
    }

    /** True when something is moving, which is what decides whether a redraw loop is needed. */
    fun isAnimated(state: SceneState): Boolean =
        state.precip != Precipitation.NONE || state.thunder || state.condition == SkyCondition.FOG

    fun render(
        canvas: Canvas,
        state: SceneState,
        timeMs: Long,
        slide: Float,
        locked: Boolean,
        overlay: OverlayConfig,
    ) {
        if (screenW <= 0 || screenH <= 0) return

        if (!hasArt) {
            drawPlaceholder(canvas)
        } else {
            val (lo, hi, blend) = Frames.bracket(state.dayPhase())
            ensureFrames(lo, hi)
            grade(state.cloud)

            fill.color = BACKDROP
            canvas.drawRect(0f, 0f, screenW.toFloat(), screenH.toFloat(), fill)

            basePaint.alpha = 255
            loBitmap?.takeIf { !it.isRecycled }?.let { canvas.drawBitmap(it, src, dst, basePaint) }
            if (blend > 0.004f) {
                blendPaint.alpha = (blend * 255f).roundToInt().coerceIn(0, 255)
                hiBitmap?.takeIf { !it.isRecycled }?.let { canvas.drawBitmap(it, src, dst, blendPaint) }
            }

            drawWeather(canvas, state, timeMs)
        }

        // Home screen only. On the lock screen this pass is simply skipped.
        if (!locked) {
            Overlay.draw(canvas, state, overlay, bounds, if (hasArt) unit.toFloat() else placeholderUnit())
        }
    }

    private fun drawWeather(canvas: Canvas, state: SceneState, timeMs: Long) {
        val u = unit.toFloat()
        val wind = state.wind.coerceIn(0f, 1f)

        val fogAmount = when {
            state.condition == SkyCondition.FOG -> 0.85f
            state.precip != Precipitation.NONE -> 0.14f
            else -> 0f
        }
        Effects.fog(canvas, bounds, u, timeMs, fogAmount, wind, FOG)

        when (state.precip) {
            Precipitation.DRIZZLE -> Effects.rain(canvas, bounds, u, timeMs, 0.3f, wind, RAIN)
            Precipitation.RAIN -> Effects.rain(canvas, bounds, u, timeMs, 0.62f, wind, RAIN)
            Precipitation.HEAVY_RAIN -> Effects.rain(canvas, bounds, u, timeMs, 1f, wind, RAIN)
            Precipitation.SNOW -> Effects.snow(canvas, bounds, u, timeMs, 0.7f, wind, SNOW)
            Precipitation.NONE -> Unit
        }

        // The lamp is the one light added rather than filtered, so it answers to the weather.
        val daylight = smoothstep(-0.10f, 0.45f, state.sunAltitude())
        Effects.drawWindows(canvas, Effects.windowGlow(state, daylight), bounds, u)

        if (state.thunder) Effects.flash(canvas, bounds, Effects.lightning(timeMs), LIGHTNING)
    }

    private fun smoothstep(e0: Float, e1: Float, x: Float): Float {
        if (e1 <= e0) return if (x >= e1) 1f else 0f
        val t = ((x - e0) / (e1 - e0)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    private fun placeholderUnit(): Float = max(1f, screenH / 280f)

    private fun drawPlaceholder(canvas: Canvas) {
        fill.color = BACKDROP
        canvas.drawRect(0f, 0f, screenW.toFloat(), screenH.toFloat(), fill)
        val u = placeholderUnit()
        val text = "NO ART IMPORTED"
        val w = PixelFont.width(text, 1) * u
        Overlay.drawText(canvas, text, (screenW - w) / 2f, screenH * 0.46f, u)
    }

    private companion object {
        const val BACKDROP = 0xFF101314.toInt()
        const val RAIN = 0xFFBFD4DC.toInt()
        const val SNOW = 0xFFF2F8FA.toInt()
        const val FOG = 0xFFB6C6C2.toInt()
        const val LIGHTNING = 0xFFE8F4FF.toInt()
    }
}
