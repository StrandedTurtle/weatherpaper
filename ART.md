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

## How the current scene is made

The scene is not hand-drawn. It is reduced from `forest-cabin-reference.png` by
script, and `art/scene.aseprite` is **generated output** — regenerate it freely:

```sh
art/rebuild.sh            # reference -> reduction -> planes -> sprite -> app resources
art/rebuild.sh 48         # same, with a 48-colour palette instead of 40
```

| script | does |
|---|---|
| `art/reduce-reference.js` | crop to the canvas aspect, area-downsample in **linear light**, quantise to a k-means palette |
| `art/split-layers-v3.js` | cut the reduction into the nine depth planes, and write `art/scene-meta.json` |
| `art/build-aseprite.js` | write the sprite through the aseprite MCP server |
| `art/apply-parallax.js` | copy each plane's parallax into `art/layers.json` |

Two things about the reduction are load-bearing. It averages in **linear light** —
averaging a picture this dark in sRGB washes it out. And it **downsamples before
quantising**; the other order throws away the sub-pixel detail that makes the
reduction read at 160×288.

`ASEPRITE=` overrides the editor binary — Steam builds are not on `PATH`.

Earlier cuts are kept for comparison: `art/split-layers.js` (v1) and
`art/split-layers-v2.js`, with `art/rebuild-v2.sh`. Neither touches what the app
uses. Delete them once you are happy with v3.

---

## The nine planes

Back to front. The split is by **scene**, not by threshold, because fog composites
*between* depths, precipitation falls in front of some planes and behind others,
and lighting needs the moon separable from the sky it sits in.

| plane | depth | parallax | for |
|---|---|---|---|
| `01-sky` | 0.00 | 0 | full-canvas backdrop; recolour for time of day |
| `02-stars` | 0.00 | 0 | fade at dawn; holds the moon |
| `03-far-haze` | 0.15 | 1 | the first plane fog should thicken |
| `04-mid-forest` | 0.30 | 2 | treeline against the sky |
| `05-ground` | 0.45 | 3 | snow accumulates, rain darkens |
| `06-cabin` | 0.50 | 3 | stands on the ground, so it shares its parallax |
| `07-near-forest` | 0.70 | 5 | the flanking trunks |
| `08-foreground` | 0.90 | 8 | nearest growth; rain falls in front of this |
| `09-canopy` | 1.00 | 8 | overhead leaves; drips in rain |

`parallax` is in artwork pixels across a full home-screen swipe. It is live —
`sway` is deliberately left at **0**, because any non-zero sway puts the wallpaper
into a permanent ~12fps loop. Turn it on per plane when a weather state earns it,
not by default.

Two invariants worth not breaking:

- **Compositing the planes reproduces the reduction exactly.** Checked on every
  build. The depth cut can be recut freely without changing how the scene looks.
- **`01-sky` is filled edge to edge** — sky above the treeline, ground colour
  below. Nothing above it can open a hole however the planes are shifted, which
  is verified against the shipped parallax values at five swipe positions.

---

## `art/scene-meta.json`

Everything the weather and lighting work needs that cannot be read off the layer
PNGs at runtime. All measured from the artwork, not guessed. **It is not plumbed
into Kotlin** — only `parallax`/`sway` are, through `art/layers.json`. Wiring the
rest is the implementation's call.

- `safeArea` — `20,21 120×267`. A 1080×2400 screen shows only this much of the
  canvas. Anything outside it is cropped on the commonest phone shape.
- `planes` — name, order, depth, parallax, sway.
- `moon` — `x 72, y 44, r 3`, on `02-stars`.
- `cabin.bbox` and `cabin.openings` — the window and the doorway, `2×7@100,190`
  and `2×8@114,189`. The cabin is unlit in the reference; lighting one of these
  is the most direct hook the scene offers.
- `horizon` — where the ground starts, per column (y 178–233). Rain splashes on
  it, snow accumulates from it, fog is thickest just above it.
- `palette` — all 40 colours, in case time-of-day is done as a palette remap.

Three things are **deliberately not shipped as assets**, because each is a cheap
scan of the layer bitmaps and this app counts every kilobyte: the snow line
(opaque pixels whose pixel directly above is transparent — the up-facing edges),
the per-plane silhouette (the alpha channel), and the wet-ground mask (the
`05-ground` alpha).

---

## Deliberate departures from the reference

The scene is a faithful reduction with three exceptions, all made for the
wallpaper rather than the picture:

1. **The moon is moved.** In the reference it sits at y7, and a 1080×2400 phone
   crops the top 21 rows — so on the commonest screen there was no moon at all.
   It now sits upper-left, which is also where the scene's existing lighting says
   it is: the cabin's left roof plane and the foliage are both lit from that side.
2. **Stars are found by local contrast**, not absolute brightness. The sky
   brightens toward the treeline until it passes any fixed threshold, which
   dragged a smear of horizon haze into the star plane.
3. **The signature is cropped.** The reference is signed in the bottom corner;
   the crop to canvas aspect removes it.

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
