package com.sylcolabs.weatherpaper.scene

import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** Trees, the clearing floor and the reflecting pool. */
internal object Forest {

    /**
     * One pine, drawn as a stack of flaring tiers. Each tier resets to a narrow width and flares
     * toward its base, which gives the notched pine silhouette rather than a smooth cone.
     *
     * Variety comes from tier count, a width exponent (spires vs. broad firs) and a slight lean,
     * so a forest built from one routine still reads as many different trees.
     */
    fun drawPine(
        buf: PixelBuffer, ctx: SceneContext, layerIndex: Int,
        cx: Int, baseY: Int, h: Int, w: Int, seed: Int,
    ) {
        val rand = Rng(seed)
        val halfW = w / 2f
        val canopyPal = ctx.canopy[layerIndex]
        val trunkPal = ctx.trunk[layerIndex]
        val accent = ctx.accent[layerIndex]
        val accentChance = ctx.season.accentChance
        val snowAmt = ctx.season.snow
        val snowCol = ctx.snowTint[layerIndex]

        val tiers = 3 + (rand.next() * 5).toInt()
        val spire = 0.52f + rand.next() * 0.34f
        val flare = 0.62f + rand.next() * 0.30f
        val lean = (rand.next() - 0.5f) * w * 0.14f
        val trunkH = (h * 0.13f).roundToInt().coerceAtLeast(2)

        // Trunk first, so the lowest canopy tier overlaps it and the tree is not left stilted.
        if (h > 14) {
            val tw = (w * 0.10f).roundToInt().coerceAtLeast(1)
            for (y in (baseY - trunkH) until baseY) {
                for (i in 0 until tw) {
                    val shade = if (i == 0) 0 else if (i < tw - 1) 2 else 1
                    buf.set((cx - tw / 2f + i).roundToInt(), y, trunkPal[shade])
                }
            }
        }

        val canopyH = (h - trunkH * 0.45f).coerceAtLeast(4f)
        val topY = baseY - h
        val tierH = canopyH / tiers

        for (ti in 0 until tiers) {
            val y0 = topY + ti * tierH
            val tierMax = halfW * ((ti + 1).toFloat() / tiers).toDouble().pow(spire.toDouble()).toFloat()
            val tierMin = tierMax * (1f - flare)

            var y = y0.roundToInt()
            val yEnd = (y0 + tierH).roundToInt()
            while (y < yEnd) {
                val local = ((y - y0) / tierH).coerceIn(0f, 1f)
                val leanX = lean * (((y - topY) / canopyH) - 0.5f) * 2f
                var hw = tierMin + (tierMax - tierMin) * local.toDouble().pow(0.72).toFloat()
                hw += (rand.next() - 0.5f) * (w * 0.08f).coerceAtLeast(1f)
                if (hw < 0.5f) hw = 0.5f
                val hwi = hw.roundToInt()
                val cxx = cx + leanX

                for (dx in -hwi..hwi) {
                    val x = (cxx + dx).roundToInt()
                    val rel = dx / hw
                    val lit = rel * ctx.lightDir

                    var shade = 4
                    if (lit > 0.30f) shade++
                    if (lit > 0.68f) shade++
                    if (lit < -0.30f) shade--
                    if (lit < -0.72f) shade--
                    if (local > 0.82f) shade--          // shadow beneath each branch tier
                    val n = Noise.hash(x, y, Art.SEED + ti)
                    if (n < 0.10f) shade++ else if (n > 0.92f) shade--

                    var c = canopyPal[shade.coerceIn(0, canopyPal.size - 1)]

                    // Autumn and spring colour arrives as patches, not per-pixel speckle.
                    if (accent != 0 && accentChance > 0f &&
                        Noise.patch(x, y, Art.SEED + 77) < accentChance
                    ) {
                        c = Colour.mix(c, accent, 0.55f + Noise.hash(x, y, Art.SEED + 3) * 0.35f)
                    }
                    // Snow lies solidly on the upper face of each tier, thinning downward.
                    if (snowAmt > 0f &&
                        (local < 0.10f || (local < 0.32f && Noise.patch(x, y, Art.SEED + 5) < snowAmt))
                    ) {
                        c = Colour.mix(c, snowCol, 0.55f + 0.35f * snowAmt)
                    }
                    buf.set(x, y, c)
                }
                y++
            }
        }
    }

    /** Place one depth layer of trees at [xOffset] (sway plus parallax). */
    fun drawLayer(buf: PixelBuffer, ctx: SceneContext, layerIndex: Int, xOffset: Float) {
        val layer = Art.LAYERS[layerIndex]
        val rand = Rng(Art.SEED xor (layer.salt * -1640531535))
        val baseY = buf.h * layer.baseY
        val margin = (buf.w * 0.3f).roundToInt()
        var i = 0
        var x = -margin

        while (x < buf.w + margin) {
            i++
            val jitter = (rand.next() - 0.5f) * layer.spacing * 0.85f
            val hFrac = layer.hMin + rand.next() * (layer.hMax - layer.hMin)
            val wFrac = layer.wMin + rand.next() * (layer.wMax - layer.wMin)
            val yJit = (rand.next() - 0.5f) * buf.h * 0.012f
            val px = (x + jitter + xOffset).roundToInt()
            val h = (buf.h * hFrac).roundToInt()

            // The framing layers only populate the screen edges, leaving the clearing open.
            val skip = layer.edgesOnly > 0f &&
                (px.toFloat() / buf.w) > layer.edgesOnly && (px.toFloat() / buf.w) < 1f - layer.edgesOnly

            if (!skip) {
                val w = (h * wFrac).roundToInt().coerceAtLeast(3)
                if (px + w >= 0 && px - w <= buf.w) {
                    drawPine(buf, ctx, layerIndex, px, (baseY + yJit).roundToInt(), h, w,
                        Art.SEED + i * 7919 + layer.spacing)
                }
            }
            x += layer.spacing
        }
    }

    fun drawGround(buf: PixelBuffer, ctx: SceneContext) {
        val hy = ctx.horizonY
        val step = Art.DITHER_STEP * 0.5f
        val snowAmt = ctx.season.snow
        val fade = (buf.h * 0.03f).roundToInt().coerceAtLeast(3)
        val far = ctx.groundColour(2)
        val near = ctx.groundColour(0)

        for (y in hy until buf.h) {
            val t = (y - hy).toFloat() / (buf.h - hy).coerceAtLeast(1)
            var base = Colour.mix(far, near, t.toDouble().pow(0.55).toFloat())
            base = Colour.scale(base, 0.82f - 0.30f * t)
            if (snowAmt > 0f) base = Colour.mix(base, ctx.snowColour, snowAmt * 0.55f)
            val seam = ((y - hy).toFloat() / fade).coerceIn(0f, 1f)

            for (x in 0 until buf.w) {
                val b = (Noise.BAYER[y and 3][x and 3] / 16f - 0.5f) * step
                val n = Noise.hash(x, y, Art.SEED + 31)
                var c = if (n < 0.05f && snowAmt < 0.5f) {
                    ctx.canopy[0][(2 + ((n * 997).toInt() % 3)).coerceIn(0, 7)]
                } else {
                    Colour.offset(base, b.roundToInt())
                }
                // Soften the seam where the clearing floor meets the treeline.
                if (seam < 1f) c = Colour.mix(buf.get(x, y), c, seam)
                buf.set(x, y, c)
            }
        }
    }

    /**
     * A still pool in the clearing floor. It mirrors what stands *above the far shore* - the
     * treeline and the sky beyond - compressed hard, because the water is seen at a glancing
     * angle. That is what makes the sky's colour shift read twice on screen.
     */
    fun drawPool(buf: PixelBuffer, ctx: SceneContext) {
        val top = (buf.h * Art.POOL_TOP).roundToInt()
        val bot = (buf.h * Art.POOL_BOTTOM).roundToInt()
        val cx = buf.w * 0.5f
        val halfW = buf.w * 0.27f
        val cy = (top + bot) / 2f
        val ry = ((bot - top) / 2f).coerceAtLeast(1f)
        val frozen = ctx.season.snow > 0.4f
        val span = (bot - top).coerceAtLeast(1)

        for (y in top..bot) {
            val dy = (y - cy) / ry
            // Perturb the ellipse so the water has a shoreline rather than a drawn oval.
            val edgeWobble = 0.88f + 0.24f * Noise.patch(0, y * 3, Art.SEED + 401)
            val hw = halfW * sqrt((1f - dy * dy).coerceAtLeast(0f)) * edgeWobble
            if (hw < 1f) continue

            val nearness = (y - top).toFloat() / span
            val srcY = (ctx.horizonY - (y - top) * REFLECT).roundToInt()
            val x0 = (cx - hw).roundToInt()
            val x1 = (cx + hw).roundToInt()

            for (x in x0..x1) {
                val wob = if (frozen) 0 else (sin(y * 0.7f + x * 0.11f) * (0.4f + nearness * 1.4f)).roundToInt()
                var c = buf.get(x + wob, srcY)
                c = if (frozen) {
                    Colour.mix(Colour.tint(c, 0.74f, 0.80f, 0.90f), ctx.snowColour, 0.38f)
                } else {
                    Colour.tint(c, 0.50f, 0.57f, 0.72f)
                }
                c = Colour.tint(c, 1f - nearness * 0.28f, 1f - nearness * 0.28f, 1f - nearness * 0.24f)
                if (x <= x0 + 1 || x >= x1 - 1 || y <= top + 1) c = Colour.mix(c, ctx.haze, 0.18f)
                val b = (Noise.BAYER[y and 3][x and 3] / 16f - 0.5f) * Art.DITHER_STEP * 0.45f
                buf.set(x, y, Colour.offset(c, b.roundToInt()))
            }
        }
    }

    private const val REFLECT = 2.8f
}
