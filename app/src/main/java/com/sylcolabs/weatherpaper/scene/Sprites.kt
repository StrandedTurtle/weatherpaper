// GENERATED FROM art/scene.json BY tools/gen-kotlin.js - DO NOT EDIT BY HAND.
// Edit the spec and re-run the generator; the preview and the app then stay in step.

package com.sylcolabs.weatherpaper.scene

/**
 * Hand-drawn sprites, imported from art/sprites/ by tools/import-sprites.js.
 *
 * Each pixel is a *slot* character, not a colour - SceneContext.spriteColour resolves it at
 * draw time against the depth layer, the time of day and the season. '.' is transparent.
 *
 * An empty set means nothing has been drawn for that part of the scene yet, and the built-in
 * procedural art is used instead. See ART.md.
 */
internal object Sprites {

    class Sprite(val w: Int, val h: Int, val ax: Int, val ay: Int, val rows: Array<String>)

    val TREES_FAR: Array<Sprite> = arrayOf()

    val TREES_MID: Array<Sprite> = arrayOf()

    val TREES_NEAR: Array<Sprite> = arrayOf()

    val TREES_FRAME: Array<Sprite> = arrayOf()

    val SCRUB: Array<Sprite> = arrayOf()

    val CLOUDS: Array<Sprite> = arrayOf()

    val SUN: Sprite? = null
    val MOON: Sprite? = null

    /** Tree sprites for a depth layer, back to front; empty means draw the procedural pine. */
    fun forLayer(index: Int): Array<Sprite> = when (index) {
        0 -> TREES_FAR
        1 -> TREES_MID
        2 -> TREES_NEAR
        3 -> TREES_FRAME
        else -> emptyArray()
    }
}
