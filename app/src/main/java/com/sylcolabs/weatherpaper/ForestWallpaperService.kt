package com.sylcolabs.weatherpaper

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import kotlin.math.ceil
import kotlin.math.max

/**
 * The live wallpaper.
 *
 * Rendering model: the scene is drawn into a small virtual bitmap (roughly [VIRTUAL_HEIGHT] px
 * tall) and blitted to the surface at an *integer* scale with filtering off. Integer scaling is
 * what keeps pixels square and identical in size; a fractional scale is what makes most pixel-art
 * wallpapers shimmer.
 */
class ForestWallpaperService : WallpaperService() {

    override fun onCreateEngine(): Engine = ForestEngine()

    private inner class ForestEngine : Engine() {

        private val handler = Handler(Looper.getMainLooper())

        /** Nearest-neighbour blit: no filtering, no antialiasing, so pixels stay hard squares. */
        private val blitPaint = Paint().apply {
            isFilterBitmap = false
            isAntiAlias = false
            isDither = false
        }

        private var virtual: Bitmap? = null
        private var virtualCanvas: Canvas? = null
        private val srcRect = Rect()
        private val dstRect = Rect()

        private var surfaceWidth = 0
        private var surfaceHeight = 0
        private var scale = 1

        private var visible = false
        private var frame = 0L

        private val drawRunnable = Runnable { drawFrame() }

        override fun onVisibilityChanged(visible: Boolean) {
            this.visible = visible
            if (visible) {
                drawFrame()
            } else {
                // Nothing runs while we are not on screen.
                handler.removeCallbacks(drawRunnable)
            }
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            surfaceWidth = width
            surfaceHeight = height
            allocateVirtual()
            drawFrame()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            visible = false
            handler.removeCallbacks(drawRunnable)
            releaseVirtual()
        }

        override fun onDestroy() {
            handler.removeCallbacks(drawRunnable)
            releaseVirtual()
            super.onDestroy()
        }

        private fun allocateVirtual() {
            releaseVirtual()
            if (surfaceWidth <= 0 || surfaceHeight <= 0) return

            scale = max(1, surfaceHeight / VIRTUAL_HEIGHT)
            val vw = ceil(surfaceWidth.toDouble() / scale).toInt().coerceAtLeast(1)
            val vh = ceil(surfaceHeight.toDouble() / scale).toInt().coerceAtLeast(1)

            val bmp = Bitmap.createBitmap(vw, vh, Bitmap.Config.ARGB_8888)
            virtual = bmp
            virtualCanvas = Canvas(bmp)
            srcRect.set(0, 0, vw, vh)
            dstRect.set(0, 0, vw * scale, vh * scale)
        }

        private fun releaseVirtual() {
            virtual?.recycle()
            virtual = null
            virtualCanvas = null
        }

        private fun drawFrame() {
            val holder = surfaceHolder
            val bmp = virtual
            val vc = virtualCanvas
            if (bmp == null || vc == null) return

            var canvas: Canvas? = null
            try {
                canvas = holder.lockCanvas()
                if (canvas != null) {
                    renderScene(vc, bmp.width, bmp.height)
                    canvas.drawBitmap(bmp, srcRect, dstRect, blitPaint)
                }
            } finally {
                if (canvas != null) holder.unlockCanvasAndPost(canvas)
            }

            handler.removeCallbacks(drawRunnable)
            if (visible) handler.postDelayed(drawRunnable, FRAME_MS)
        }

        /**
         * Placeholder scene. Step 1 only proves the build and scaling pipeline; the real
         * layered forest renderer replaces this once the art spec is agreed.
         */
        private fun renderScene(canvas: Canvas, vw: Int, vh: Int) {
            frame++
            canvas.drawColor(FOREST_DEEP)

            // A one-pixel checker strip along the top: on device every square must be exactly
            // `scale` pixels wide. If they are uneven, the integer-scale maths is wrong.
            val probe = Paint().apply { isAntiAlias = false }
            for (x in 0 until vw) {
                probe.color = if ((x / 4) % 2 == 0) FOREST_NIGHT else CANOPY_LIT
                canvas.drawRect(x.toFloat(), 0f, (x + 1).toFloat(), 4f, probe)
            }

            // Slow sweep, so it is obvious the loop is running and stopping with visibility.
            probe.color = CANOPY_MID
            val y = (frame % vh).toFloat()
            canvas.drawRect(0f, y, vw.toFloat(), y + 2f, probe)
        }
    }

    private companion object {
        /** Target height of the virtual pixel canvas, in scene pixels. */
        const val VIRTUAL_HEIGHT = 260

        /** ~12fps. Low frame rates read as deliberate for pixel art and cost far less battery. */
        const val FRAME_MS = 83L

        val FOREST_DEEP = Color.rgb(0x0F, 0x24, 0x19)
        val FOREST_NIGHT = Color.rgb(0x06, 0x10, 0x0C)
        val CANOPY_MID = Color.rgb(0x1C, 0x3D, 0x28)
        val CANOPY_LIT = Color.rgb(0x3A, 0x67, 0x40)
    }
}
