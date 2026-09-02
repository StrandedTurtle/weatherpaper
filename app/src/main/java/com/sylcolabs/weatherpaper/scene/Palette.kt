package com.sylcolabs.weatherpaper.scene

import kotlin.math.PI
import kotlin.math.pow
import kotlin.math.sin

/**
 * Turns "what the weather is" into "what colour things are", once per state change.
 *
 * Every per-pixel colour the forest needs is precomputed here into small lookup tables, one set
 * per depth layer. That is what lets the draw loops be array reads instead of colour maths, and
 * it is the single place to change if the palette should behave differently.
 */
internal class SceneContext(state: SceneState, val w: Int, val h: Int) {

    val alt = state.sunAltitude()
    val isDay = state.isDay
    val cloud = state.cloud.coerceIn(0f, 1f)
    val season: Art.Season = Art.SEASONS[state.season.ordinal]
    val horizonY = (h * Art.HORIZON).toInt()

    val skyStops: IntArray
    val haze: Int
    val nightness: Float
    val lightDir: Int
    val bodyX: Int
    val bodyY: Int

    /** Per-layer resolved palettes, indexed by layer. */
    val canopy: Array<IntArray>
    val trunk: Array<IntArray>
    val accent: IntArray
    val snowTint: IntArray

    val tintR: Float
    val tintG: Float
    val tintB: Float

    /** Cloud shading, resolved from the live sky so sprite cloud slots have somewhere to land. */
    val cloudRamp: IntArray

    val snowColour: Int
    val rainColour: Int
    val fogColour: Int
    val starColour: Int
    val sunColour: Int
    val moonColour: Int
    val lightningColour: Int

    init {
        val dayLen = state.sunset - state.sunrise
        val rising = if (isDay) state.hour < state.sunrise + dayLen / 2f else state.hour > state.sunset

        val night = Colour.resample(Art.SKY_NIGHT, RAMP_STOPS)
        val day = Colour.resample(Art.SKY_DAY, RAMP_STOPS)
        val twilight = Colour.resample(if (rising) Art.SKY_DAWN else Art.SKY_DUSK, RAMP_STOPS)

        val toTwi = smoothStep(-0.32f, -0.02f, alt)
        val toDay = smoothStep(0.02f, 0.34f, alt)
        val stops = IntArray(RAMP_STOPS) {
            Colour.mix(Colour.mix(night[it], twilight[it], toTwi), day[it], toDay)
        }
        // Cloud cover pulls the sky toward flat grey and drops its brightness.
        skyStops = if (cloud <= 0f) stops else IntArray(RAMP_STOPS) {
            val c = stops[it]
            val l = Colour.luma(c)
            Colour.scale(Colour.mix(c, Colour.of(l, l, (l * 1.04f).toInt()), 0.75f * cloud), 1f - 0.20f * cloud)
        }
        haze = Colour.ramp(skyStops, 1f)
        nightness = smoothStep(0.10f, -0.25f, alt)

        // Foliage tint: night blue-black through golden hour to neutral daylight.
        var tr: Float; var tg: Float; var tb: Float
        if (alt <= 0f) {
            val t = smoothStep(-0.35f, 0f, alt)
            tr = lerp(Art.TINT_NIGHT[0], Art.TINT_GOLDEN[0], t)
            tg = lerp(Art.TINT_NIGHT[1], Art.TINT_GOLDEN[1], t)
            tb = lerp(Art.TINT_NIGHT[2], Art.TINT_GOLDEN[2], t)
        } else {
            val t = smoothStep(0.02f, 0.30f, alt)
            tr = lerp(Art.TINT_GOLDEN[0], 1f, t)
            tg = lerp(Art.TINT_GOLDEN[1], 1f, t)
            tb = lerp(Art.TINT_GOLDEN[2], 1f, t)
        }
        if (cloud > 0f) {
            val l = (tr + tg + tb) / 3f
            val m = 0.55f * cloud
            tr = lerp(tr, l, m) * (1f - 0.18f * cloud)
            tg = lerp(tg, l, m) * (1f - 0.16f * cloud)
            tb = lerp(tb, l, m) * (1f - 0.12f * cloud)
        }

        val nightLen = 24f - dayLen
        val since = if (state.hour > state.sunset) state.hour - state.sunset else state.hour + 24f - state.sunset
        val f = if (isDay) (state.hour - state.sunrise) / dayLen else since / nightLen
        bodyX = (w * (0.12f + 0.76f * f)).toInt()
        bodyY = (horizonY - horizonY * (if (isDay) 0.82f else 0.68f) * sin(PI * f).toFloat()).toInt()
        lightDir = if (bodyX > w / 2) 1 else -1

        val layers = Art.LAYERS
        canopy = Array(layers.size) { IntArray(Art.CANOPY.size) }
        trunk = Array(layers.size) { IntArray(Art.TRUNK.size) }
        accent = IntArray(layers.size)
        snowTint = IntArray(layers.size)

        for (li in layers.indices) {
            val depth = layers[li].depth
            val depthMul = 0.32f + 0.68f * depth
            val hazeAmt = depth.toDouble().pow(1.3).toFloat() * 0.55f

            for (i in Art.CANOPY.indices) {
                var c = Colour.tint(Art.CANOPY[i], season.tintR, season.tintG, season.tintB)
                c = Colour.tint(c, tr, tg, tb)
                c = Colour.scale(c, depthMul)
                canopy[li][i] = Colour.mix(c, haze, hazeAmt)
            }
            for (i in Art.TRUNK.indices) {
                var c = Colour.tint(Art.TRUNK[i], tr, tg, tb)
                c = Colour.scale(c, 0.34f + 0.66f * depth)
                trunk[li][i] = Colour.mix(c, haze, hazeAmt)
            }
            accent[li] = if (season.accent == 0) 0 else
                Colour.scale(Colour.tint(season.accent, tr, tg, tb), depthMul)
            snowTint[li] = Colour.scale(Colour.tint(Art.SNOW, tr, tg, tb), depthMul)
        }

        val cloudDark = Colour.mix(haze, 0x000000, 0.18f + 0.16f * cloud)
        val cloudLight = Colour.mix(haze, 0xFFFFFF, 0.30f - 0.22f * cloud)
        cloudRamp = IntArray(4) { Colour.mix(cloudDark, cloudLight, it / 3f) }

        snowColour = Colour.tint(Art.SNOW, tr, tg, tb)
        rainColour = Colour.tint(Art.RAIN, tr, tg, tb)
        fogColour = Colour.tint(Art.FOG, tr, tg, tb)
        starColour = Art.STAR
        sunColour = Art.SUN
        moonColour = Art.MOON
        lightningColour = Art.LIGHTNING
        tintR = tr; tintG = tg; tintB = tb
    }

    /**
     * Resolve one sprite character to a colour.
     *
     * This is the indirection that lets a single drawing work at dawn, at midnight, in autumn
     * and under snow: the artist names a slot, and its colour is decided here from the depth
     * layer, the time of day and the season. Mirrors spriteColour() in tools/scene.js.
     */
    fun spriteColour(ch: Char, layerIndex: Int): Int {
        val layer = layerIndex.coerceIn(0, canopy.size - 1)
        return when (ch) {
            in '0'..'7' -> canopy[layer][ch - '0']
            in 'a'..'d' -> trunk[layer][ch - 'a']
            in 'g'..'i' -> groundColour(ch - 'g')
            in 'p'..'s' -> cloudRamp[ch - 'p']
            // "Catches snow": white in winter, ordinary lit foliage otherwise, so one drawing
            // covers every season without a separate winter sprite.
            'w' -> Colour.mix(canopy[layer][5], snowTint[layer], season.snow)
            'x' -> if (accent[layer] == 0) canopy[layer][4] else accent[layer]
            'y' -> if (isDay) sunColour else moonColour
            'z' -> starColour
            else -> canopy[layer][4]
        }
    }

    fun groundColour(i: Int): Int =
        Colour.tint(Colour.tint(Art.GROUND[i], season.tintR, season.tintG, season.tintB), tintR, tintG, tintB)

    private companion object {
        const val RAMP_STOPS = 5
        fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t
    }
}
