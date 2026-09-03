package com.sylcolabs.weatherpaper

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import com.sylcolabs.weatherpaper.scene.Layers
import com.sylcolabs.weatherpaper.scene.SceneRenderer
import com.sylcolabs.weatherpaper.weather.WeatherRepository

/**
 * The live wallpaper.
 *
 * Draws the imported scene layers scaled by a whole number so pixels stay square, and does as
 * little as possible the rest of the time: nothing runs while the wallpaper is hidden, and a
 * still scene stops redrawing entirely instead of spinning at a fixed frame rate.
 */
class WeatherPaperService : WallpaperService() {

    override fun onCreateEngine(): Engine = SceneEngine()

    private inner class SceneEngine : Engine(), SharedPreferences.OnSharedPreferenceChangeListener {

        private val handler = Handler(Looper.getMainLooper())
        private val renderer = SceneRenderer(this@WeatherPaperService)
        private val prefs = Prefs(this@WeatherPaperService)
        private val repo = WeatherRepository(this@WeatherPaperService, prefs)

        private val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        private val power = getSystemService(Context.POWER_SERVICE) as? PowerManager

        private var visible = false
        private var locked = false
        private var slide = 0f
        private var overlay = prefs.overlay

        private val drawRunnable = Runnable { drawFrame() }

        /**
         * Lock state has no official API for wallpapers, so it is tracked from the screen and
         * unlock broadcasts rather than polled every frame.
         */
        private val screenReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val was = locked
                locked = keyguard?.isKeyguardLocked ?: false
                if (was != locked && visible) drawFrame()
            }
        }

        override fun onCreate(surfaceHolder: SurfaceHolder) {
            super.onCreate(surfaceHolder)
            setTouchEventsEnabled(false)
            locked = keyguard?.isKeyguardLocked ?: false
            prefs.registerListener(this)
            registerReceiver(
                screenReceiver,
                IntentFilter().apply {
                    addAction(Intent.ACTION_SCREEN_ON)
                    addAction(Intent.ACTION_SCREEN_OFF)
                    addAction(Intent.ACTION_USER_PRESENT)
                },
            )
        }

        override fun onSharedPreferenceChanged(sp: SharedPreferences?, key: String?) {
            overlay = prefs.overlay
            if (visible) drawFrame()
        }

        override fun onVisibilityChanged(visible: Boolean) {
            this.visible = visible
            if (visible) {
                locked = keyguard?.isKeyguardLocked ?: false
                overlay = prefs.overlay
                // The only place weather is ever fetched: no background jobs, no wakeups.
                repo.refreshIfStale { handler.post { if (this.visible) drawFrame() } }
                drawFrame()
            } else {
                handler.removeCallbacks(drawRunnable)
            }
        }

        override fun onOffsetsChanged(
            xOffset: Float, yOffset: Float,
            xStep: Float, yStep: Float,
            xPixels: Int, yPixels: Int,
        ) {
            slide = (xOffset - 0.5f) * 2f
            if (visible) drawFrame()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            renderer.resize(width, height)
            drawFrame()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            visible = false
            handler.removeCallbacks(drawRunnable)
        }

        override fun onDestroy() {
            handler.removeCallbacks(drawRunnable)
            prefs.unregisterListener(this)
            runCatching { unregisterReceiver(screenReceiver) }
            renderer.release()
            super.onDestroy()
        }

        private fun drawFrame() {
            val state = SceneStates.current(prefs, repo)
            val holder = surfaceHolder
            var canvas: Canvas? = null
            try {
                canvas = holder.lockCanvas()
                if (canvas != null) {
                    renderer.render(
                        canvas, state, SystemClock.elapsedRealtime(), slide,
                        locked && !isPreview, overlay,
                    )
                }
            } catch (e: IllegalArgumentException) {
                // Surface went away mid-frame; the next onSurfaceChanged will sort it out.
            } finally {
                if (canvas != null) runCatching { holder.unlockCanvasAndPost(canvas) }
            }
            scheduleNext()
        }

        /**
         * Decide when - or whether - to draw again.
         *
         * A scene with drifting layers runs at [FRAME_MS]. A still one does not spin: if the
         * clock is showing we wake once at the next minute boundary, and otherwise we stop
         * completely until something changes.
         */
        private fun scheduleNext() {
            handler.removeCallbacks(drawRunnable)
            if (!visible) return

            val saving = power?.isPowerSaveMode == true
            if (Layers.hasMotion && !saving) {
                handler.postDelayed(drawRunnable, FRAME_MS)
                return
            }
            if (overlay.enabled && overlay.showClock && !locked) {
                val now = System.currentTimeMillis()
                handler.postDelayed(drawRunnable, MINUTE_MS - (now % MINUTE_MS))
            }
        }
    }

    private companion object {
        /** ~12fps. Low frame rates read as deliberate for pixel art and cost far less battery. */
        const val FRAME_MS = 83L
        const val MINUTE_MS = 60_000L
    }
}
