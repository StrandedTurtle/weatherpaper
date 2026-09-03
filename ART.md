# Art direction — the layered scene

You compose the whole daytime scene in Aseprite as layers. I fit the app to what you drew.
This replaces the earlier per-sprite workflow, which made you draw around the code's folder
structure instead of composing properly.

> **Status.** The palette, templates and guides in this document exist now — you can start
> drawing today. The layer importer does not exist yet: I build it when your first export
> lands, sized to what you actually drew. Nothing in the repo will fight you in the meantime;
> the current procedural art keeps the app running until yours replaces it.

---

## Everything you'll draw, in order

**Phase 1 — the base daytime scene.** One Aseprite file, one layer per band below. This is the
bulk of the work and it is all you need to do before handing it back.

**Phase 2 — the moving pieces.** Three things cannot live in a static layer because they travel
independently across the sky. Small, and you only do them once.

| | What | Size | Count |
|---|---|---|---|
| **1** | The scene layers (table further down) | 160 × 288 each | 5 essential, 2 optional |
| **2** | Clouds | ~24–56 × 10–24 | 4–6 |
| **2** | Sun | ~12–18 square | 1 |
| **2** | Moon — draw it **full**, the code cuts the phase | ~12–18 square | 1 |
| *opt* | Launcher icon | 108 × 108 | 1 |
| *opt* | Replacement 5×7 readout font | 5 × 7 per glyph | 44 |

**That's the whole list.** There is no night version, no winter version, no rainy version. Those
all come out of the base scene automatically — see *What you don't draw*.

---

## The one constraint that stays

**Draw only with the colours in `art/palette.gpl`.**

Each palette colour names a *slot* — "canopy shade 5", "trunk shade 2" — not a final colour. The
renderer decides what that slot actually looks like at draw time, from the depth layer, the sun's
altitude and the season.

That single indirection is what buys you every derived state for free. A literal RGB value cannot
be retinted; a slot can. It is the reason you draw one daytime scene rather than sixteen.

Load `art/palette.gpl` in Aseprite via **Palette → Load Palette**. Keep
`art/palette-reference.png` open beside you — it names all 25 slots.

If you want different greens, change `palette` in `art/scene.json`, re-run
`node tools/gen-palette.js`, and reload it. Everything you have already drawn follows the new
colours automatically, because your pixels reference slots and not values.

---

## Canvas

**160 × 288.** Every layer is this exact size. Start from `art/template/scene-160x288.png`.

Drop `art/template/guides.png` in as a top layer for reference, then **hide or delete it before
exporting** — it is drawn in pure red and yellow deliberately, so if it ever survives into an
export the importer rejects it by name instead of quietly treating it as artwork.

| | |
|---|---|
| **Always visible** | columns **20–139**, rows **21–287** |
| **Bleed** | 20 columns each side, 21 rows off the top |
| **Horizon guide** | row **172** |

The bleed is not padding. It is what parallax slides into as you swipe the home screen, and what
wider screens (tablets, unfolded foldables) reveal. Draw it properly — just don't put anything
you'd miss out there.

The app scales by a whole number only and crops to fit, so your pixels stay exact squares on
every device. On a 1080 × 2400 phone one drawn pixel is 9 screen pixels.

**The horizon guide is a suggestion, not a rule.** Put the treeline where it looks right and tell
me the row; I'll move the code's constant to match. Same for the pool position and the layer
bands — the drawing leads.

---

## The scene layers

Draw order, back to front. Name them with the numeric prefix so ordering survives the export.

| File | What it is | Movement |
|---|---|---|
| `01-backdrop.png` | *Optional.* Distant hills, ridgelines or mist behind the treeline | still |
| `02-treeline.png` | The far forest band sitting on the horizon | still |
| `03-ground.png` | Clearing floor, from the horizon to the bottom edge | still |
| `04-water.png` | *Optional.* The pool — see **MIRROR** below | still |
| `05-forest-mid.png` | The body of the forest. Most of what the eye reads as "forest" | sways gently |
| `06-forest-near.png` | Nearer trees, typically framing the sides | sways more |
| `07-frame.png` | Big foreground silhouettes at the screen edges | sways most, strongest parallax |

Five essential, two optional. Anything you leave out keeps the current procedural version until
you get to it, so you can hand me `05-forest-mid.png` alone and see it running.

**Depth is yours to draw.** The code applies haze and darkening per layer, but contrast is an
artistic decision: far layers want fewer shades and softer silhouettes, the framing layer wants
one or two of the darkest canopy shades and shape doing all the work. Fine detail on the framing
layer mostly vanishes once depth tinting lands.

**The moving layers need loose edges.** `05`–`07` slide by a few pixels. Keep their left and
right extremes as ordinary foliage or trunk rather than a distinctive feature, so nothing
recognisable drifts in and out.

---

## Markers to paint *as you draw*

Four slots are instructions rather than colours. They have to go in while you're drawing the base
scene — they cannot be added afterwards without going back over every layer.

**SNOW** — "snow settles here in winter." White in winter, ordinary lit foliage the rest of the
year. Put it along upward-facing branches, the tops of rocks, and across the ground. Paint it as
if drawing a light snowfall; the code fades it in and out with the season.

**ACCENT** (magenta) — "this turns with the season." Amber in autumn, blossom in spring, plain
foliage in summer and winter. Scatter it through the canopy in clumps rather than evenly — think
5–25% of the foliage on the mid layers, and much less on the near-black framing layer, where
colour reads as noise.

**MIRROR** (cyan) — "fill this with a live reflection of the sky." Use it for the pool's open
surface. You still draw the water's edge, ripples, reeds and anything floating in normal colours;
only the MIRROR region is replaced. This is how the water keeps changing colour through the day
instead of freezing at whatever you painted. If you'd rather art-direct the water completely,
just don't use MIRROR — but you lose the dawn and dusk reflection, which is one of the better
effects in the scene.

**LAMP** (orange) — "dark by day, warm glow after dusk." Cabin windows, a lantern, a campfire.
Entirely optional, but it is the cheapest way to make the night scene feel inhabited.

---

## What you don't draw

Not because you can't, but because these must stay dynamic — freezing them into a drawing is what
would make the wallpaper feel dead.

- **The sky gradient.** It ramps continuously through night, dawn, day and dusk. Leave the sky
  area transparent in every layer.
- **Rain, snowfall, fog, lightning.** Particles and bands generated per frame, driven by live
  weather.
- **Stars.** Single pixels, faded by sun altitude.
- **Every retint.** Night, golden hour, overcast, all four seasons, and the depth haze.

**You can still art-direct the sky.** Give me four short colour ramps — `night`, `dawn`, `day`,
`dusk` — as 3–5 stops each, either as hex values or a small PNG strip. The code cross-fades
between them by the sun's real altitude. That's the only way to design the sky and keep it alive.
The current ones are in `skyRamps` in `art/scene.json` if you want a starting point.

---

## Exporting from Aseprite

Layers must come out **aligned and untrimmed**, all 160 × 288. This is the single most common way
to lose a day's work.

Command line, which is the reliable route:

```sh
aseprite -b scene.aseprite --split-layers --ignore-empty --save-as art/layers/{layer}.png
```

Or in the GUI: **File → Export → Export As**, then

- **Split Layers** — on
- **Trim Sprite** and **Trim Cels** — **off** (this is the one that bites)
- **Resize** — 100%
- **Merge Duplicate Frames** — irrelevant, single frame

Then check: every exported PNG should be exactly 160 × 288, and the guide layer should not be
among them.

---

## Handing it back to me

Send the layer PNGs and tell me three things:

1. **Which row you put the horizon on**, if it isn't 172.
2. **Whether you used MIRROR** for the water.
3. **Anything you deliberately left for later** — I'll leave those on the procedural version
   rather than shipping a gap.

I'll come back with it running in the browser preview so you can see every hour, season and
weather state before anything touches the phone.

---

## What I'll build when the layers land

So there are no surprises about what changes:

- **`tools/import-layers.js`** — validates each layer against the palette and writes an indexed
  form. It will have a `--snap` mode that maps near-miss colours to the closest slot and reports
  them, rather than hard-failing on a stray anti-aliased pixel.
- **Layers ship as PNGs** in `res/`, decoded once at first draw, rather than baked into Kotlin
  source — a full-scene layer is far too large to inline sensibly.
- **A fixed 160 × 288 virtual canvas.** Today the canvas size shifts with the device, which is
  fine for procedural art and wrong for hand-drawn art. Whole-number scaling and centre-cropping
  move to the blit stage, so what you draw is exactly what appears.
- **`drawLayer` becomes a blit** of your image at its sway and parallax offset, replacing the
  per-tree placement. Simpler and cheaper than what's there now.
- **MIRROR and LAMP resolution** in `SceneContext.spriteColour`, both trivial additions.
- The procedural pine generator stays as the fallback for any layer you haven't drawn.

The cached-layer architecture already works exactly this way — whole layers blitted at an offset —
so this simplifies the renderer rather than complicating it.

---

## Gotchas

- **Trim must be off on export.** Layers that don't share the same 160 × 288 origin will not line
  up, and there is no way to recover the alignment afterwards.
- **Anti-aliasing is the usual palette failure.** Hard 1px pencil, no soft brushes, no partial
  opacity. Alpha is a threshold: under 50% is empty, over is fully opaque.
- **Don't scale in the editor.** Draw at final size; a 1.5× resize destroys the grid.
- **Interlaced and 16-bit PNGs are rejected.** Aseprite's defaults are fine.
- **The magenta, cyan and orange markers never render as those colours.** They are instructions.
- **Delete the guide layer before exporting.**
- After changing the palette, re-run `gen-palette.js` and reload it in Aseprite, or your next
  drawing session will be full of near-miss colours.

---

## Reference

```sh
node tools/gen-palette.js     # palette.gpl + palette-reference.png
node tools/gen-template.js    # the 160x288 canvas and guides
node tools/shoot.js           # contact sheets of every state -> art/shots/
node tools/build-preview.js   # self-contained preview -> tools/preview/index.html
```

Node 18+ is all that's needed for art work. There are no npm dependencies.

The per-sprite pipeline described previously still exists (`tools/import-sprites.js`,
`art/sprites/`) if you ever want individually placed trees rather than composed layers. It is not
the route we're taking.
