# Handing me the art

The repo takes a scene as a stack of PNG layers. It makes no assumptions about what the picture
is: any canvas size, any palette, any number of layers, any subject.

Draw whatever you want. Then we look at it together and decide what the app should do with it.

---

## What the code currently does

Exactly one thing, deliberately: **composites your layers back to front, scales them by a whole
number so the pixels stay square, and crops to the screen.**

- The canvas size comes from your images. Nothing is fixed in code.
- Colours are yours. There is no palette, no index mapping, no retinting.
- Layers are still by default. Parallax and drift exist per layer but are set to zero.
- The readout (clock, temperature, condition, place) draws on top, home screen only.
- Weather, location and the time of day are fetched and available, but **nothing yet connects
  them to the artwork**. That is the interesting decision, and it is deliberately left open
  until there is real art to look at.

---

## The loop

```sh
node tools/import-layers.js                 # art/layers/*.png -> art/layers.json + app resources
node tools/gen-kotlin.js                    # -> scene/Layers.kt
node tools/gen-thumb.js                     # wallpaper picker tile, flattened from your layers
node tools/preview-layers.js 1080 2400      # see it cropped to a phone, without building
```

Commit and push; CI builds an installable APK (Actions → latest run → download the artifact).

Node 18+ is the only tool needed. There are no npm dependencies.

---

## Exporting

Put the PNGs in `art/layers/`. They composite in **filename order**, back to front, so name them
`01-…`, `02-…` and so on.

**Every layer must be the same pixel size** — that is the only hard requirement, because they
stack on top of each other. In Aseprite that means **Trim must be OFF** when you export, or the
layers come out at different sizes and cannot be realigned afterwards:

```sh
aseprite -b scene.aseprite --split-layers --ignore-empty --save-as art/layers/{layer}.png
```

Or **File → Export → Export As** with *Split Layers* on, *Trim Sprite* and *Trim Cels* off, and
*Resize* at 100%.

The importer checks this and tells you which file disagrees.

Per-layer `parallax` and `sway` live in `art/layers.json` and are **preserved across re-imports**,
so re-exporting your art will not undo any motion tuning.

---

## What to send me

The layer PNGs, and whatever you want to say about them. Useful to know, but none of it required
up front:

- Which layers should move, and roughly how much
- Anything you drew intending it to react — water, windows, foliage that should turn, sky
- Anything you left out on purpose

Then we work out the rest: how time of day and weather affect it, what needs drawing a second
time and what can be derived, and how the canvas should sit on different screen shapes.

I would rather see the picture before proposing any of that.

---

## Known open questions

Listed so they are not a surprise later, not to be answered now:

- **How the art reacts to time of day and weather.** Options range from drawing a few key
  variants and cross-fading, to deriving everything from one drawing, to some mix. Which is right
  depends entirely on how you have drawn it.
- **What happens on screens a different shape from your canvas.** Currently: scale to cover,
  centre horizontally, anchor to the bottom. Changeable per-scene in `art/layers.json`.
- **Rain, snow, fog, stars, sun and moon.** All removed. Whether they come back as drawn art or
  as generated effects is a decision for after we see the scene.

---

## The one thing still drawn by me

`art/font.json` — the 5×7 bitmap font for the readout. `#` is ink, `.` is empty, rows separated by
`/`. Edit it directly and re-run `gen-kotlin.js`; it is plain text and meant to be readable.
Replace it whenever you like.
