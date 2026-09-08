# Handing me the art

The repo takes a scene as a stack of PNG layers. It makes no assumptions about what the picture
is: any canvas size, any palette, any number of layers, any subject.

Draw whatever you want. Then we look at it together and decide what the app should do with it.

---

## What the code currently does

**The artwork is a grid of finished frames: eight times of day by two sky conditions.** Every
frame is the whole scene, already lit. The app picks the four surrounding the current time and
cloud cover and blends between them, scales by a whole number so the pixels stay square, and
crops to the screen.

- The canvas size comes from your images. Nothing is fixed in code.
- Colours are yours. The relight moves them; it never invents them, and it never moves geometry.
- Weather, location, time of day, season and the phase of the moon are all connected to what you
  see. Nothing computed is left undrawn.
- The readout (clock, temperature, condition, place) draws on top, home screen only.

The frames come from `art/layers/` — your nine planes — via `art/relight.js`. The planes are the
**source**, not something the app ships: they are relit and flattened offline, and only the flat
frames go in the APK.

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

| plane | depth | wind | for |
|---|---|---|---|
| `01-sky` | 0.00 | 0 | full-canvas backdrop; recoloured for time of day |
| `02-stars` | 0.00 | 0 | fades with cloud, fog and daylight; holds the moon |
| `03-far-haze` | 0.15 | 0.15 | the first plane fog thickens |
| `04-mid-forest` | 0.30 | 0.30 | treeline against the sky |
| `05-ground` | 0.45 | 0 | the floor does not sway |
| `06-cabin` | 0.50 | 0 | a building does not sway; carries the lit window |
| `07-near-forest` | 0.70 | 0.60 | flanking trunks and their foliage |
| `08-foreground` | 0.90 | 0.90 | undergrowth; whips about in a gale |
| `09-canopy` | 1.00 | 1.00 | overhead leaves; moves most |

`parallax` is **0 on every plane** — the scene is deliberately static. `sway` is
unconditional drift and is also 0. What moves the scene is `wind`, a per-plane
*susceptibility* between 0 and 1: the sky, ground and cabin do not move at all,
the canopy moves most. (Per-plane motion is currently unused: the frames are flat, and
frame, so one number covers dead calm through a gale and a still day costs
nothing.

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
node art/relight.js                         # source planes -> one relit frame per time of day
node tools/import-frames.js                 # art/frames/*.png -> art/frames.json + resources
node tools/gen-kotlin.js                    # -> scene/Frames.kt
node tools/gen-thumb.js                     # wallpaper picker tile, flattened from your layers
node tools/preview-weather.js               # every weather state over real frames
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
- **Rain, snow, fog and lightning.** Generated effects, drawn over the frame — see `Effects.kt`.
- **Stars and the moon.** Yours, in plane 02. The moon is drawn full there, since one image
  cannot hold every night of the month; its phase is carved back out at runtime.
- **Seasons.** Particles rather than art: blossom, fireflies, falling leaves. Four seasons of
  frames would be sixty-four images and near two megabytes, which is the wrong trade here.

---

## The one thing still drawn by me

`art/font.json` — the 5×7 bitmap font for the readout. `#` is ink, `.` is empty, rows separated by
`/`. Edit it directly and re-run `gen-kotlin.js`; it is plain text and meant to be readable.
Replace it whenever you like.

---

## How lighting works now

The artwork is drawn once, as a clear night. `art/relight.js` relights it into one PNG per **time
of day and sky condition** in `art/frames/`, offline. A runtime colour matrix cannot know the sky
wants to go blue while the canopy goes green, so daylight only ever lifted and flattened the night
scene. The same argument applies to cloud one level down, which is why overcast is a real frame and
not a saturation filter.

### Lighting is by material, not by plane

`art/segment.js` decides **what each pixel is** — sky, mist, foliage, grass, wood, stone — and the
relight lights it as that.

This replaced lighting by plane, and it had to. The planes in `art/layers/` are horizontal *bands*:
`09-canopy` is rows 0–71, `07-near-forest` 33–225, `08-foreground` 226–287. A tree runs through all
three. Because each plane was also normalised against its own luminance range, identical bark
either side of an arbitrary row got a different map — traced down column x=14, a source that was
continuous (luminance 20 → 19) came out as **31 → 13**. That step was the unnatural edge, and
nothing in the picture is there.

Classification is tractable because the artwork is k-means indexed to exactly **40 colours**: 40
decisions, not 46,080, and every boundary pixel-exact by definition. Two ambiguities colour cannot
settle are settled spatially — open sky is separated from the inside of a tree by a flood fill from
the top edge (open sky is 81% pure black; trunks never get below luminance 8), and shadow is not
treated as a material at all but filled from whatever surrounds it, so shadow inside a tree is that
tree.

```sh
node art/segment.js          # writes art/materials.json + art/materials.png
```

`art/materials.png` is a false-colour render — look at it. `art/materials.json` lists all 40
palette entries and is hand-editable: set `material` on an entry to overrule the rules, and
re-running keeps your edits.

### Materials change hue; the source decides brightness

There is **one tone curve for the whole picture** per frame (`TONE`), not one per material. Giving
each material its own level meant two adjacent pixels of identical paint — both pure black, say —
could land at 17 and 67 depending on which side of a boundary they fell. Materials now carry a
tint and a level trim of at most ~5%, and that bound is load-bearing: it is the only thing left
that can put a step at a boundary, and it caps that step at 1.1×.

The depth ladder survives without being imposed. The artwork already contains it — the source
medians run foliage 24, mist 47, grass 66 — and a monotone curve cannot reorder them. Imposing a
ladder on top is what produced the banding in the first place.

### The sky is drawn, not relit

The source has no daytime sky. Its visible sky region is median luminance **0.0**, interquartile
range 12.5 — essentially pure black. `art/sky.js` draws one instead: a dithered gradient, cloud
from value noise, a horizon glow, and a sun bloom at the hours the sun is low enough to be in
frame. Stars and the moon are held out of the base image entirely and composited back at whatever
strength the hour calls for, because as the brightest paint in the scene they otherwise sit at the
top of the tone curve and survive into broad daylight.

### Checking it

```sh
node art/relight.js --report     # median luminance per material
node art/relight.js --contrast   # detail kept, against the source
node art/relight.js --seams      # edges where the source is flat - the regression test
```

`--seams` is the one that matters: it walks the rows where the old bands used to meet and reports
the largest edge in the output where the *source* is flat. It was 3.7× before this pass and is
1.10× after. If a future change puts it back above about 1.15, something has started lighting the
same paint two different ways again.

```sh
node art/relight.js && node tools/import-frames.js && node tools/gen-kotlin.js
```

Edit `TONE` to change how bright a time of day is, and `TIMES` to change its colour: each material
entry is `[tint, level trim]`, plus a `sun` and `shade` for the frame. Keep the trims near 1.0. The
source planes in `art/layers/` stay — they are the input, and now also where depth comes from.
