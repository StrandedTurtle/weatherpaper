package com.sylcolabs.weatherpaper.ui

import android.content.Context
import android.graphics.Canvas
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import com.sylcolabs.weatherpaper.scene.Layers
import com.sylcolabs.weatherpaper.scene.OverlayConfig
import com.sylcolabs.weatherpaper.scene.SceneRenderer
import com.sylcolabs.weatherpaper.scene.SceneState

/**
 * A phone-shaped preview driven by the same [SceneRenderer] the wallpaper uses, so what is
 * positioned here is what appears on the home screen.
 *
 * Dragging anywhere on it moves the readout, which is more direct than a pair of sliders.
 */
internal class PreviewView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val renderer = SceneRenderer(context)

    var state: SceneState = SceneState()
        set(v) { field = v; invalidate() }

    /**
     * Named "readout" rather than "overlay" deliberately: [View] already has an `overlay`
     * property, and shadowing it here would silently resolve to the wrong thing.
     */
    var readout: OverlayConfig = OverlayConfig()
        set(v) { field = v; invalidate() }

    /** Called while the readout is dragged, with fractional coordinates. */
    var onReadoutMoved: ((Float, Float) -> Unit)? = null

    var animating = true
        set(v) { field = v; if (v) invalidate() }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        // Hold a tall phone aspect so the composition is judged as it will actually appear.
        val w = MeasureSpec.getSize(widthMeasureSpec)
        setMeasuredDimension(w, (w * ASPECT).toInt())
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        if (w > 0 && h > 0) renderer.resize(w, h)
    }

    override fun onDraw(canvas: Canvas) {
        renderer.render(canvas, state, SystemClock.elapsedRealtime(), 0f, false, readout)
        if (animating && Layers.hasMotion) postInvalidateDelayed(FRAME_MS)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                val x = (event.x / width).coerceIn(0f, 1f)
                val y = (event.y / height).coerceIn(0f, 1f)
                readout = readout.copy(x = x, y = y)
                onReadoutMoved?.invoke(x, y)
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                performClick()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    fun release() = renderer.release()

    private companion object {
        const val ASPECT = 1.9f
        const val FRAME_MS = 83L
    }
}
