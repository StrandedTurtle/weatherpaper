# Replacing the art

Everything you see in the wallpaper is either **hand-drawn sprites** or **generated from
`art/scene.json`**. This is how to swap the drawn parts for your own without touching the app
code or breaking the build.

The short version: draw PNGs using only the colours in `art/palette.gpl`, drop them in
`art/sprites/`, run two commands, done.

---

## The one rule

**Sprites are palette-indexed, not literal colour.**

Each pixel you draw names a *slot* — "canopy shade 5", "trunk shade 2", "catches snow" — and the
renderer decides that slot's actual colour at draw time from three things:

- **Depth layer** — distant trees are hazier and bluer, foreground trees are near-black silhouette
- **Time of day** — foliage goes blue-black at night and warm at golden hour
- **Season** — spring, summer, autumn and winter shift the whole ramp

This is why **one drawing covers every season and every time of day**. You do not draw a summer
tree and a winter tree; you draw a tree, and mark which pixels catch snow and which turn with the
season. If you draw in arbitrary RGB instead, the importer rejects it — and rightly so, because a
literal colour cannot be retinted.

---

## Setup

```sh
git clone https://github.com/StrandedTurtle/weatherpaper
cd weatherpaper
node tools/gen-palette.js      # writes art/palette.gpl + art/palette-reference.png
```

Node 18+ is the only tool needed for art work. There are no npm dependencies — nothing to install.

Then in your editor:

- **Aseprite** — Palette menu → *Load Palette* → `art/palette.gpl`. Work in RGB mode; Indexed also
  works.
- **GIMP / Krita** — Windows → Dockable Dialogs → Palettes → import `art/palette.gpl`.
- **Piskel / Pixilart** — no `.gpl` import; open `art/palette-reference.png` alongside and pick
  colours from it.

`art/palette-reference.png` shows every slot with its name. Keep it open while you draw.

---

## What to draw, and how big

Sprites are **never rescaled** — a non-integer resize is exactly what makes pixel art look mushy,
so they are drawn at the size they appear. The virtual canvas a real phone produces is always
about **280px tall and 120–160px wide**, whatever the screen resolution, so fixed sizes hold up
across devices.

| Folder | What it is | Height | Typical width | Anchor |
|---|---|---|---|---|
| `art/sprites/trees/far/` | Distant treeline on the horizon | **15–27 px** | ~45–60% of height | bottom centre |
| `art/sprites/trees/mid/` | The body of the forest | **32–50 px** | ~40–55% of height | bottom centre |
| `art/sprites/trees/near/` | Nearer trees, edges only | **64–92 px** | ~35–50% of height | bottom centre |
| `art/sprites/trees/frame/` | Tall silhouettes framing the screen | **218–300 px** | ~20–30% of height | bottom centre |
| `art/sprites/scrub/` | Low bushes along the treeline | 4–12 px | 6–16 px | bottom centre |
| `art/sprites/clouds/` | Drifting clouds | 8–20 px | 20–50 px | centre |
| `art/sprites/decor/` | `sun.png` and `moon.png` only | 8–16 px | 8–16 px | centre |

Put **several variants in each folder** — the renderer picks between them per tree, and that
variety is what stops the forest looking stamped. Three to six per layer is plenty.

The importer prints the expected range and warns if a sprite is well outside it. File names do
not matter (except `sun.png` / `moon.png`), and sprites are trimmed to their drawn bounds, so
canvas padding is harmless.

### Depth is your job too

The renderer handles haze and darkening per layer, but **contrast is yours**. Far trees should be
drawn with fewer shades and softer edges; framing trees are read as silhouettes, so keep them to
one or two of the darkest canopy shades and let the shape do the work. Detail on a framing tree
mostly disappears once the depth tint is applied.

---

## The slots

Draw with these and nothing else. `#RRGGBB` values are in `art/palette.gpl`.

| Slot | What it becomes |
|---|---|
| **CANOPY 0–7** | Foliage, darkest to lightest. Your main range — most of a tree is 2–6. |
| **TRUNK 0–3** | Bark, darkest to lightest. |
| **GROUND 0–2** | Forest floor tones, for scrub and undergrowth. |
| **CLOUD 0–3** | Cloud shading, dark to light. Resolved live from the sky, so a cloud drawn once looks right at noon and at dusk. |
| **SNOW** | "This pixel catches snow." White in winter, ordinary lit foliage the rest of the year — so put it on upward-facing branches and leave it. |
| **ACCENT** (magenta) | "This pixel turns with the season." Amber in autumn, blossom in spring, ordinary foliage in summer and winter. Scatter it through the canopy. |
| **GLOW** | Sun and moon body. |
| **STAR** | Starlight. |

Anything with **alpha below 50% is transparent**. Anything else that is not an exact palette
colour is an error, and the importer tells you which pixel and which slot you probably meant:

```
error: art/sprites/trees/mid/pine-a.png: colour #2E5837 at (12,7) is not in the palette.
       Closest slot is CANOPY 6. Load art/palette.gpl and use only those colours.
```

That is almost always anti-aliasing or a soft brush. **Turn off anti-aliasing** — use a
hard 1px pencil.

---

## The loop

```sh
node tools/import-sprites.js   # validate drawings -> art/sprites.json
node tools/build-preview.js    # rebuild the browser preview
open tools/preview/index.html  # drive every weather/time/season state with sliders
```

Iterate there until it looks right — no compiling, no phone. Then push it into the app:

```sh
node tools/gen-kotlin.js       # art/*.json -> Art.kt, PixelFont.kt, Sprites.kt
node tools/gen-thumb.js        # regenerate the wallpaper picker thumbnail
```

Commit and push; CI builds an installable APK (Actions → latest run → download the artifact).
To build locally instead you need Android Studio or the SDK, then `./gradlew assembleRelease`.

Contact sheets are quicker than the preview for comparing states side by side:

```sh
node tools/shoot.js            # art/shots/{time,weather,seasons}.png
node tools/shoot.js seasons    # just one suite
```

### Try it in one step

```sh
cp art/examples/pine-mid.png art/sprites/trees/mid/
node tools/import-sprites.js && node tools/build-preview.js
```

`art/examples/pine-mid.png` is a working sprite — open it in your editor to see how the slots are
used in practice. Delete it from `art/sprites/` when you have your own.

---

## Falling back

**Every set is independent.** An empty folder means that part of the scene uses the built-in
procedural art, so you can replace one layer at a time and always have something that runs. A
sensible order is `trees/mid` first (most visible), then `trees/frame`, then `near`, `far`,
`scrub`, `clouds`, `decor`.

`git status` will show `art/sprites.json` and the generated Kotlin changing — both are committed
on purpose, because CI builds without running Node.

---

## The rest of the art

Not everything is a sprite. These live in **`art/scene.json`**, which is the single source of
truth for both the preview and the app. Edit it and re-run `gen-kotlin.js`.

**Palette** (`palette`) — the 8 canopy shades, 4 trunk, 3 ground, and the accents. Changing these
changes every sprite at once, since sprites only reference slots. If you change the palette,
re-run `gen-palette.js` and reload it in your editor.

**Sky** (`skyRamps`) — four gradients: `night`, `dawn`, `day`, `dusk`. Any number of stops; they
are resampled and cross-faded by sun altitude. `ditherStep` sets how chunky the sky banding is —
raise it for a more retro look, lower it for smoother.

**Seasons** (`seasons`) — each has an RGB `tint` multiplier applied to all foliage, a `snow`
amount (0–1), and an `accent` colour with an `accentChance`.

**Layout** (`layout`) — `horizon`, the pool position, and the depth layers. Per layer: `depth`
(0 = nearest, 1 = furthest — drives haze and darkening), `baseY` (where trees stand, as a
fraction of height), `spacing` (px between trees), `sway`, `parallax`, and `edgesOnly` (keeps a
layer out of the middle, which is what leaves the clearing open).

**Font** (`font`) — the 5×7 readout font, as ASCII art. `#` is ink, `.` is empty, rows separated
by `/`. Edit it directly; it is meant to be readable.

**Procedural fallbacks** — if you would rather tune the generated trees than draw them, the pine
generator is `drawPine()` in `tools/forest.js`, mirrored in `Forest.kt`. Change the JS, check it
in the preview, then port the same change to the Kotlin.

---

## Keeping the two renderers in step

The art is drawn twice: once in JavaScript for the preview, once in Kotlin for the app. They are
deliberately structured the same way so changes port one-to-one.

| Reference (`tools/`) | Android (`app/.../scene/`) | |
|---|---|---|
| `render.js` | `Draw.kt` | colour, ramps, PRNG, dithering |
| `scene.js` | `Palette.kt`, `Sky.kt` | state → colour, sky, stars, sun/moon |
| `forest.js` | `Forest.kt` | trees, depth layers, ground, scrub, pool |
| `weather.js` | `Precipitation.kt` | cloud, rain, snow, fog, lightning |
| `overlay.js` | `Overlay.kt` | outlined pixel text |
| `compose.js` | `SceneRenderer.kt` | pass order and layer caching |

**You only need to touch these if you change how art is drawn, not what is drawn.** Swapping
sprites, palettes, ramps, seasons and layout needs no code changes at all.

If you do edit a renderer: both use the same PRNG (`mulberry32`) and must make the *same number
of random calls in the same order*, or the preview and the device will place trees differently.

`Art.kt`, `PixelFont.kt` and `Sprites.kt` are **generated**. Never edit them by hand — your
changes will be overwritten the next time anyone runs the generator.

---

## Gotchas

- **Anti-aliasing is the usual culprit.** Hard 1px pencil, no soft brushes, no opacity below 100%
  except fully transparent.
- **Don't scale sprites in your editor.** Draw at final size. Scaling by 1.5× destroys the grid.
- **Interlaced PNGs are rejected** — re-export without interlacing.
- **8-bit PNGs only** (greyscale, RGB, indexed or with alpha — all fine). 16-bit is rejected.
- **Semi-transparent pixels don't exist.** Alpha is a threshold: below 50% is empty, above is
  fully opaque.
- **The magenta ACCENT slot is a marker, not a colour.** It never renders magenta.
- After changing the palette, **re-run `gen-palette.js` and reload it in your editor**, or your
  next drawing will be full of near-miss colours.
