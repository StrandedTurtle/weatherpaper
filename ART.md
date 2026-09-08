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

The artwork is drawn once, as a clear night. `art/relight.js` relights each source plane and
flattens the result to one PNG per **time of day and sky condition** in `art/frames/`.

This replaced a runtime colour matrix over the single night image. A matrix cannot know that the
sky wants to go blue while the canopy goes green, so daylight only ever lifted and flattened the
night scene. Doing it offline, per plane, means each surface is lit on its own terms.

The same argument applies to cloud, one level down, which is why overcast is a real frame and not
a saturation filter: a filter can dull the picture, but it cannot merge the painted clouds into a
lid or fill in the shadows, and those are the two things a cloudy day actually does.

### The two axes

**Eight times** — `night`, `firstlight`, `dawn`, `morning`, `midday`, `golden`, `dusk`,
`twilight`. The two blue hours exist because sunset-to-midnight and midnight-to-sunrise were
five-hour gaps spanning the fastest-changing light there is. Having them also frees `dawn` and
`dusk` to be sunrise and sunset — warm and brief — rather than doubling as the dim end of the day.

**Two conditions** — `clear` and `overcast`, the latter written as a modifier on the time tables
rather than tables of its own. The modifier that matters is ramp *width* (`SPREAD`): with the
whole sky as the source instead of a point, shadow and highlight both collapse toward the
midtone. Two things had to be learned by looking:

- An overcast day is **bright and flat, not dim**. Cutting the levels as well as compressing the
  ramp takes the light away twice and gives a murky dusk. The shaded classes go *up* — light
  reaches under things that had only shadow before.
- The sky needs crushing far harder than anything else. Compressed only as much as the foliage,
  the painted clouds survive and it reads as a *partly* cloudy day.

The app blends across both axes at once, which four ordinary source-over draws hit exactly:
alphas `1`, `b`, `c(1-b)/(1-cb)` and `cb` leave each frame carrying precisely its own weight.

### The depth ladder

What makes a forest read as deep is not hue, it is **luminance order**: sky brightest, then the
far haze, then mid trunks, with the near trees and the overhanging canopy nearly black against
all of it. So a plane is not given colours directly. It is given a **target median luminance** —
its rung on the ladder — plus a tint, and the ramp is built to hit that target: the plane's own
median pixel is pinned to the middle stop, darker pixels run down toward the ambient shade colour
and lighter ones climb toward the sun colour.

```sh
node art/relight.js --report      # prints the ladder each frame actually achieved
```

Read that report down each column. It must descend, or the foreground stops being a silhouette
and starts looking like fog.

Mapping is by luminance, so every drawn detail survives and only the colour changes. Bounds come
from the 2nd and 98th percentiles rather than min/max — one stray bright pixel in the mid-forest
plane would otherwise set the ceiling and squash the whole plane into the bottom of its ramp. The
night frame is passed through unmodified, so it is exactly the art as drawn.

Three things that had to be handled specially, all found by looking rather than reasoning:

- **Warm light is a change of hue, not of brightness.** Mixing a stop toward the sun colour after
  setting its level also drags its luminance up toward the sun's — a canopy highlight meant for
  luminance 39 landed at 123, which turned daylit foliage grey and dusty. Tint first, set the
  brightness second.
- **A sky is not a lit object.** Ramp width is per material (`SPREAD`): foliage and ground have
  real shadow and get a wide ramp, but the sky is a smooth field of light and gets a narrow one.
  Remapping the night sky's own structure faithfully — near-black at the zenith — gave a midday
  sky that was navy at the top.
- **Stars are painted into the sky and haze planes**, not just the stars plane, and survive into
  daylight as white specks. At daylit times those planes go through a 3×3 **median filter**,
  which is what removes salt-and-pepper noise exactly; an outlier-and-average test was tried
  first and let stars through, because a star two pixels across drags its own local average up
  and hides in it.

```sh
node art/relight.js && node tools/import-frames.js && node tools/gen-kotlin.js
```

Edit the `TIMES` table at the top of `art/relight.js` to change how any time of day looks: each
entry is `[target luminance, tint]`, plus a `sun` and `shade` for the frame. The source planes in
`art/layers/` stay — they are the input, not dead weight.
