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

/**
 * Draws the scene: the artwork for the current time and sky, with live weather over it.
 *
 * The artwork is a grid of complete frames - eight times of day by two sky conditions - each
 * relit offline from the source planes by art/relight.js. Lighting is a property of the art
 * rather than a filter applied at runtime, because a filter cannot know that the sky wants to go
 * blue while the canopy goes green, which is why a single night image lifted toward day always
 * read flat.
 *
 * That applies to cloud as much as to the hour. Overcast used to be a saturation matrix over the
 * clear-sky image, which is the same mistake one level down: it could dull the picture but it
 * could not merge the painted clouds into a lid or fill in the shadows, which is what a cloudy
 * day actually does. There is a real overcast frame for every time now, and the matrix is gone.
 *
 * What is left at runtime is only what has to be: which four frames surround the current state,
 * how far between them we are, and the weather on top.
 */
internal class SceneRenderer(private val context: Context) {

    private var screenW = 0
    private var screenH = 0

    /** Screen pixels per artwork pixel. Always whole, which is what keeps pixels square. */
    var unit = 1
        private set

    private val bounds = RectF()
    private val src = Rect()
    private val dst = Rect()

    private val blit = Paint().apply {
        isFilterBitmap = false; isAntiAlias = false; isDither = false
    }
    private val fill = Paint()

    val hasArt: Boolean get() = !Frames.isEmpty && Frames.WIDTH > 0 && Frames.HEIGHT > 0

    // ---------------------------------------------------------------- frame cache
    //
    // At most four frames are ever in view at once, and which four changes a handful of times a
    // day. A fixed four-slot cache with least-recently-used eviction therefore never thrashes,
    // and holding only what is on screen costs far less than keeping all sixteen resident.

    private val slotRes = IntArray(SLOTS) { 0 }
    private val slotBmp = arrayOfNulls<Bitmap>(SLOTS)
    private val slotUsed = LongArray(SLOTS)
    private var clock = 0L

    private val decodeOpts = BitmapFactory.Options().apply {
        inScaled = false
        inPreferredConfig = Bitmap.Config.ARGB_8888
    }

    private fun frame(resId: Int): Bitmap? {
        if (resId == 0) return null
        for (i in 0 until SLOTS) {
            val b = slotBmp[i]
            if (slotRes[i] == resId && b != null && !b.isRecycled) {
                slotUsed[i] = ++clock
                return b
            }
        }
        var victim = 0
        for (i in 0 until SLOTS) {
            if (slotBmp[i] == null) { victim = i; break }
            if (slotUsed[i] < slotUsed[victim]) victim = i
        }
        val decoded = runCatching {
            BitmapFactory.decodeResource(context.resources, resId, decodeOpts)
        }.getOrNull() ?: return null
        slotBmp[victim]?.recycle()
        slotBmp[victim] = decoded
        slotRes[victim] = resId
        slotUsed[victim] = ++clock
        return decoded
    }

    fun release() {
        for (i in 0 until SLOTS) {
            slotBmp[i]?.recycle()
            slotBmp[i] = null
            slotRes[i] = 0
            slotUsed[i] = 0
        }
    }

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
     * Whether seasonal particles are drawn. Off restores the property that a calm, clear day
     * costs nothing at all: it is the only thing here that moves without the weather moving.
     */
    var seasonalDetail = true

    /** True when something is moving, which is what decides whether a redraw loop is needed. */
    fun isAnimated(state: SceneState): Boolean {
        if (state.precip != Precipitation.NONE || state.thunder) return true
        if (state.condition == SkyCondition.FOG) return true
        return seasonalDetail && seasonMoves(state)
    }

    /** Winter adds nothing, and fireflies only exist after dark. */
    private fun seasonMoves(state: SceneState): Boolean = when (state.season) {
        Season.WINTER -> false
        Season.SUMMER -> state.sunAltitude() < 0.06f
        else -> true
    }

    /**
     * How overcast the sky is, 0..1.
     *
     * Cloud cover is a fraction, but it does not read linearly: a quarter-covered sky still looks
     * like a clear day and still casts shadows, and it is only well past half that the light
     * actually changes character. Fog gets the overcast lighting outright - whatever the cover
     * says, you are inside the cloud.
     */
    private fun overcastAmount(state: SceneState): Float {
        if (state.condition == SkyCondition.FOG) return 1f
        return smoothstep(0.28f, 0.94f, state.cloud.coerceIn(0f, 1f))
    }

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
            fill.color = BACKDROP
            canvas.drawRect(0f, 0f, screenW.toFloat(), screenH.toFloat(), fill)
            drawArtwork(canvas, state, timeMs)
            drawWeather(canvas, state, timeMs)
        }

        // Home screen only. On the lock screen this pass is simply skipped.
        if (!locked) {
            Overlay.draw(canvas, state, overlay, bounds, if (hasArt) unit.toFloat() else placeholderUnit())
        }
    }

    /**
     * Blend the four frames around the current time and cloud cover.
     *
     * The wanted result is the bilinear mix
     *
     *     (1-c)(1-b)·LoClear + (1-c)b·HiClear + c(1-b)·LoOvercast + c·b·HiOvercast
     *
     * and four ordinary source-over draws can hit it exactly, which is worth doing rather than
     * approximating: painting the layers with alphas 1, b, c(1-b)/(1-cb) and cb leaves each image
     * carrying precisely its own weight. That avoids compositing into an offscreen bitmap and the
     * ~180 KB per copy that would cost.
     */
    private fun drawArtwork(canvas: Canvas, state: SceneState, timeMs: Long) {
        val (lo, hi, b) = Frames.bracket(state.dayPhase())
        val c = overcastAmount(state)

        val denom = 1f - c * b
        val aHiClear = b
        val aLoOver = if (denom > 1e-4f) c * (1f - b) / denom else 0f
        val aHiOver = c * b

        paste(canvas, Frames.ALL[lo].clear, 1f)
        paste(canvas, Frames.ALL[hi].clear, aHiClear)
        paste(canvas, Frames.ALL[lo].overcast, aLoOver)
        paste(canvas, Frames.ALL[hi].overcast, aHiOver)

        // The moon is painted into the artwork as a full disc, so its phase is carved back out
        // here. Only worth doing while it is actually visible and not behind cloud.
        val moonlight = (1f - c) * Effects.moonVisibility(state)
        if (moonlight > 0.02f) Effects.carveMoonPhase(canvas, state.moonPhase, moonlight, bounds, unit.toFloat())
    }

    private fun paste(canvas: Canvas, resId: Int, alpha: Float) {
        if (alpha <= 0.004f) return
        val bmp = frame(resId) ?: return
        if (bmp.isRecycled) return
        blit.alpha = (alpha * 255f).roundToInt().coerceIn(0, 255)
        canvas.drawBitmap(bmp, src, dst, blit)
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

        // Season, as particles. Suppressed while it is already precipitating - leaves and
        // snowflakes in the same air just read as one confused mess.
        if (seasonalDetail && state.precip == Precipitation.NONE) {
            Effects.seasonal(canvas, bounds, u, timeMs, state.season, wind, 1f - daylight)
        }

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
        /** Four frames surround any (time, cloud) point, so four slots never thrash. */
        const val SLOTS = 4

        const val BACKDROP = 0xFF101314.toInt()
        const val RAIN = 0xFFBFD4DC.toInt()
        const val SNOW = 0xFFF2F8FA.toInt()
        const val FOG = 0xFFB6C6C2.toInt()
        const val LIGHTNING = 0xFFE8F4FF.toInt()
    }
}
