package com.sylcolabs.weatherpaper.scene

import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** Everything that moves every frame: cloud, rain, snow, fog and lightning. */
internal object Weather {

    private fun drawCloud(buf: PixelBuffer, ctx: SceneContext, cx: Int, cy: Int, scale: Float, seed: Int) {
        val rand = Rng(seed)
        val lobes = 3 + (rand.next() * 3).toInt()
        val ox = FloatArray(lobes); val oy = FloatArray(lobes)
        val rx = FloatArray(lobes); val ry = FloatArray(lobes)
        var maxR = 0f
        for (i in 0 until lobes) {
            rx[i] = (7f + rand.next() * 11f) * scale
            ry[i] = rx[i] * (0.42f + rand.next() * 0.22f)
            ox[i] = (i - (lobes - 1) / 2f) * rx[i] * 0.85f + (rand.next() - 0.5f) * 4f
            oy[i] = (rand.next() - 0.5f) * 3f * scale
            maxR = maxOf(maxR, abs(ox[i]) + rx[i])
        }
        val lightTop = Colour.mix(ctx.haze, 0xFFFFFF, 0.30f - 0.22f * ctx.cloud)
        val darkBase = Colour.mix(ctx.haze, 0x000000, 0.18f + 0.16f * ctx.cloud)
        val alpha = 0.55f + 0.40f * ctx.cloud
        val yr = (14f * scale).toInt()
        val xr = maxR.toInt() + 2

        for (dy in -yr..yr) {
            for (dx in -xr..xr) {
                var inside = false
                var topness = 0f
                for (i in 0 until lobes) {
                    val nx = (dx - ox[i]) / rx[i]
                    val ny = (dy - oy[i]) / ry[i]
                    if (nx * nx + ny * ny <= 1f) { inside = true; topness = (-ny * 0.5f + 0.5f).coerceIn(0f, 1f); break }
                }
                if (!inside) continue
                val c = Colour.mix(darkBase, lightTop, topness.toDouble().pow(1.4).toFloat())
                val b = Noise.BAYER[(cy + dy) and 3][(cx + dx) and 3] / 16f
                buf.blend(cx + dx, cy + dy, c, alpha * (0.75f + 0.25f * b))
            }
        }
    }

    fun drawClouds(buf: PixelBuffer, ctx: SceneContext, st: SceneState, timeMs: Long) {
        if (ctx.cloud < 0.08f) return
        val n = (1f + ctx.cloud * 7f).roundToInt()
        val rand = Rng(Art.SEED xor 0xC10D)
        val secs = timeMs / 1000f
        for (i in 0 until n) {
            val base = rand.next()
            val y = (ctx.horizonY * (0.08f + rand.next() * 0.50f)).roundToInt()
            val scale = 0.55f + rand.next() * 0.95f
            val speed = (0.6f + rand.next() * 0.7f) * (0.25f + st.wind * 1.9f)
            var u = (base + secs * speed * 0.012f) % 1.4f
            if (u < 0) u += 1.4f
            drawCloud(buf, ctx, ((u - 0.2f) * buf.w).roundToInt(), y, scale, Art.SEED + i * 131)
        }
    }

    /** Rain, drizzle and snow. Particle positions are a pure function of index and time. */
    fun drawPrecip(buf: PixelBuffer, ctx: SceneContext, st: SceneState, timeMs: Long) {
        if (st.precip == Precipitation.NONE) return
        val cfg = Art.PRECIP[st.precip.ordinal - 1]
        val snow = st.precip == Precipitation.SNOW
        val rand = Rng(Art.SEED xor 0x9A1F)
        val colour = if (snow) ctx.snowColour else ctx.rainColour
        val secs = timeMs / 1000f

        for (i in 0 until cfg.count) {
            val px = rand.next()
            val py = rand.next()
            val vr = 0.75f + rand.next() * 0.5f
            val fall = cfg.speed * vr * (if (snow) 14f else 62f)
            val drift = if (snow) sin(timeMs / 900f + i) * 5f + st.wind * 34f * secs * 0.35f
                        else st.wind * fall * 0.55f

            var y = (py * buf.h + secs * fall) % buf.h
            var x = (px * buf.w + (if (snow) drift else secs * drift)) % buf.w
            if (x < 0) x += buf.w
            if (y < 0) y += buf.h

            if (snow) {
                buf.blend(x.roundToInt(), y.roundToInt(), colour, cfg.alpha * (0.5f + 0.5f * vr))
            } else {
                val slant = st.wind * 2.2f
                for (k in 0 until cfg.length) {
                    buf.blend((x - k * slant).roundToInt(), (y - k).roundToInt(), colour,
                        cfg.alpha * (1f - k.toFloat() / (cfg.length + 1)))
                }
            }
        }
    }

    /** Dithered horizontal bands that thicken toward the ground and drift with the wind. */
    fun drawFog(buf: PixelBuffer, ctx: SceneContext, st: SceneState, timeMs: Long, amount: Float) {
        if (amount <= 0.02f) return
        val drift = ((timeMs / 1000f) * (0.3f + st.wind * 2.2f) * 6f).roundToInt()
        val y0 = (ctx.horizonY * 0.72f).toInt()
        val span = (buf.h - y0).coerceAtLeast(1)
        for (y in y0 until buf.h) {
            val depth = ((y - y0).toFloat() / span).coerceIn(0f, 1f)
            val band = 0.5f + 0.5f * sin(y * 0.09f + timeMs / 2600f)
            val a = amount * (0.12f + 0.55f * depth.toDouble().pow(0.7).toFloat()) * (0.65f + 0.35f * band)
            for (x in 0 until buf.w) {
                val b = Noise.BAYER[y and 3][(x + drift) and 3] / 16f
                if (a > b * 0.55f) buf.blend(x, y, ctx.fogColour, a * 0.85f)
            }
        }
    }

    /** Strength of the thunderstorm flash at [timeMs], 0 when there is no strike. */
    fun lightningAlpha(timeMs: Long): Float {
        val period = 4200L
        val idx = (timeMs / period).toInt()
        val rand = Rng(Art.SEED xor idx)
        if (rand.next() > 0.45f) return 0f
        val local = timeMs - idx * period - (rand.next() * 400f).toLong()
        if (local < 0 || local > 320) return 0f
        val strikes = intArrayOf(0, 60, 90, 200, 240)
        var a = 0f
        for (i in strikes.indices) {
            val d = local - strikes[i]
            if (d in 0..54) a = maxOf(a, (1f - d / 55f) * (if (i % 2 == 0) 1f else 0.55f))
        }
        return a * 0.72f
    }

    fun drawLightning(buf: PixelBuffer, ctx: SceneContext, a: Float) {
        if (a <= 0.01f) return
        for (y in 0 until buf.h) for (x in 0 until buf.w) buf.blend(x, y, ctx.lightningColour, a * 0.55f)
    }
}
