// GENERATED FROM art/scene.json BY tools/gen-kotlin.js - DO NOT EDIT BY HAND.
// Edit the spec and re-run the generator; the preview and the app then stay in step.

package com.sylcolabs.weatherpaper.scene

/** Palette, ramps, layout and tuning constants for the forest scene. */
internal object Art {
    const val VIRTUAL_HEIGHT = 260
    const val SEED = 20260902
    const val DITHER_STEP = 18.0f

    val CANOPY = intArrayOf(0x06100C, 0x0A1A12, 0x0F2419, 0x153021, 0x1C3D28, 0x244A2F, 0x2E5836, 0x3A6740)
    val TRUNK = intArrayOf(0x150F0B, 0x1F1710, 0x2A2018, 0x352920)
    val GROUND = intArrayOf(0x0B1710, 0x12251A, 0x1B3322)

    const val SUN = 0xF5D98A
    const val MOON = 0xE8E4D0
    const val STAR = 0xC8D4E0
    const val FIREFLY = 0xD8C060
    const val LIGHTNING = 0xE8F4FF
    const val SNOW = 0xE0EAF0
    const val RAIN = 0x8FA8B8
    const val FOG = 0x8FA0A8

    val SKY_NIGHT = intArrayOf(0x070B14, 0x0B1220, 0x152040)
    val SKY_DAWN = intArrayOf(0x141026, 0x3D2B3A, 0x7A4A46, 0xC08A5E)
    val SKY_DAY = intArrayOf(0x2E4A5E, 0x4A7290, 0x7FA8C0)
    val SKY_DUSK = intArrayOf(0x16121F, 0x4A2E3E, 0x8A4A44, 0xD08A50)

    const val HORIZON = 0.6f
    const val POOL_TOP = 0.778f
    const val POOL_BOTTOM = 0.888f

    /** Foliage tint keyframes: night, golden hour, full day. */
    val TINT_NIGHT = floatArrayOf(0.40f, 0.48f, 0.70f)
    val TINT_GOLDEN = floatArrayOf(1.26f, 1.00f, 0.70f)

    class Season(
        val tintR: Float, val tintG: Float, val tintB: Float,
        val snow: Float, val accent: Int, val accentChance: Float,
    )

    /** Indexed by [Season] ordinal: spring, summer, autumn, winter. */
    val SEASONS = arrayOf(
        Season(1.04f, 1.12f, 0.94f, 0.0f, 0xC88FA8, 0.045f),
        Season(1.0f, 1.0f, 1.0f, 0.0f, 0, 0.0f),
        Season(1.14f, 0.94f, 0.78f, 0.0f, 0xB5763A, 0.26f),
        Season(0.86f, 0.96f, 1.06f, 0.55f, 0, 0.0f),
    )

    class Layer(
        val depth: Float, val baseY: Float,
        val hMin: Float, val hMax: Float,
        val wMin: Float, val wMax: Float,
        val spacing: Int, val sway: Float, val parallax: Float,
        val edgesOnly: Float, val salt: Int,
    )

    /** Back to front. The near and framing layers are edge-only, which is what leaves the clearing open. */
    val LAYERS = arrayOf(
        Layer(0.8f, 0.606f, 0.055f, 0.095f, 0.44f, 0.62f, 6, 0.2f, 0.12f, 0.0f, 6),
        Layer(0.46f, 0.652f, 0.115f, 0.18f, 0.4f, 0.56f, 13, 0.55f, 0.38f, 0.0f, 6),
        Layer(0.18f, 0.735f, 0.23f, 0.33f, 0.34f, 0.48f, 25, 0.95f, 0.68f, 0.3f, 7),
        Layer(0.0f, 1.07f, 0.78f, 1.07f, 0.21f, 0.31f, 27, 1.5f, 1.0f, 0.15f, 8),
    )

    class Precip(val count: Int, val speed: Float, val length: Int, val alpha: Float)

    /** Indexed by [Precipitation] ordinal minus one (NONE has no entry). */
    val PRECIP = arrayOf(
        Precip(55, 0.9f, 2, 0.45f),
        Precip(130, 1.6f, 4, 0.65f),
        Precip(240, 2.3f, 6, 0.8f),
        Precip(110, 0.35f, 1, 0.85f),
    )
}
