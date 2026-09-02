package com.sylcolabs.weatherpaper.scene

import kotlin.math.pow
import kotlin.math.sqrt

/** Sky gradient, stars and the sun/moon. All static for a given state, so all cached. */
internal object Sky {

    /**
     * Vertical gradient, ordered-dithered with a 4x4 Bayer matrix. The dithering is deliberate:
     * it keeps the sky banded and retro instead of smoothly airbrushed, and it means the whole
     * sky lives in a handful of colours.
     */
    fun draw(buf: PixelBuffer, ctx: SceneContext) {
        val step = Art.DITHER_STEP
        val hy = (ctx.horizonY - 1).coerceAtLeast(1)
        for (y in 0 until buf.h) {
            val c = Colour.ramp(ctx.skyStops, (y.toFloat() / hy).coerceIn(0f, 1f))
            val row = Noise.BAYER[y and 3]
            for (x in 0 until buf.w) {
                val b = (row[x and 3] / 16f - 0.5f) * step
                buf.set(x, y, Colour.quantise(c, b, step))
            }
        }
    }

    fun drawStars(buf: PixelBuffer, ctx: SceneContext, timeMs: Long) {
        if (ctx.nightness <= 0.02f) return
        val rand = Rng(Art.SEED xor 0x51ED)
        val n = (buf.w * ctx.horizonY / 900).coerceAtLeast(1)
        val t = timeMs.toFloat()
        for (i in 0 until n) {
            val x = (rand.next() * buf.w).toInt()
            val y = (rand.next() * ctx.horizonY * 0.80f).toInt()
            val base = 0.35f + rand.next() * 0.65f
            val twinkle = 0.75f + 0.25f * kotlin.math.sin(t * 0.0022f + i * 2.4f)
            buf.blend(x, y, ctx.starColour, base * twinkle * ctx.nightness * (1f - ctx.cloud * 0.9f))
        }
    }

    /** The sun by day, the moon (with its real phase) by night, on an arc across the sky. */
    fun drawCelestial(buf: PixelBuffer, ctx: SceneContext, moonPhase: Float) {
        val vis = 1f - ctx.cloud * 0.85f
        if (vis <= 0.05f) return
        val cx = ctx.bodyX
        val cy = ctx.bodyY
        if (cy > ctx.horizonY + 4) return

        val sun = ctx.isDay

        // A hand-drawn sun or moon replaces the procedural disc when one has been imported.
        val drawn = if (sun) Sprites.SUN else Sprites.MOON
        if (drawn != null) {
            Forest.drawSprite(buf, ctx, drawn, cx, cy, 2, vis)
            return
        }

        val r = if (sun) 5 else 6
        val core = if (sun) ctx.sunColour else ctx.moonColour

        val glowR = (if (sun) r * 4 else (r * 2.6f).toInt())
        for (dy in -glowR..glowR) {
            for (dx in -glowR..glowR) {
                val d = sqrt((dx * dx + dy * dy).toFloat())
                if (d <= r || d > glowR) continue
                val a = (1f - (d - r) / (glowR - r)).toDouble().pow(2.2).toFloat() * (if (sun) 0.5f else 0.3f) * vis
                val bd = Noise.BAYER[(cy + dy) and 3][(cx + dx) and 3] / 16f
                if (a > bd * 0.55f) buf.blend(cx + dx, cy + dy, core, a * 0.8f)
            }
        }

        val cosT = kotlin.math.cos(2.0 * Math.PI * moonPhase).toFloat()
        for (dy in -r..r) {
            val edge = sqrt((r * r - dy * dy).coerceAtLeast(0).toFloat())
            for (dx in -r..r) {
                if (dx * dx + dy * dy > r * r) continue
                if (!sun) {
                    val dxx = if (moonPhase > 0.5f) -dx else dx
                    if (dxx < cosT * edge) continue // unlit side of the moon
                }
                buf.blend(cx + dx, cy + dy, core, vis)
            }
        }
    }
}
