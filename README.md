# WeatherPaper

A pixel-art forest live wallpaper for Android that follows your local weather, the time of day
and the season. Dark green, deliberately small, and built to cost almost nothing to run.

![The scene at dawn, midday, golden hour and night](art/shots/time.png)

## What it does

A forest clearing: framing trees in silhouette at the screen edges, a treeline across the
middle, open sky in the gap, and a pool that mirrors the sky back at you.

- **Time of day** — the sky ramps continuously from night through dawn to day and back, with
  stars, and the sun or the moon (at its real phase) tracking an arc across the sky.
- **Weather** — cloud cover, drizzle through to heavy rain, snow, fog, and thunderstorm flashes.
  Wind bends the rain and sways the canopy.
- **Season** — spring blossom, summer green, autumn ambers, winter snow caps and a frozen pool.
  Hemisphere-aware, so it is correct south of the equator.
- **Home-screen readout** — an optional clock, temperature, condition and place name in a 5×7
  pixel font. Home screen only; the lock screen stays pure art.

## Installing

There is no Play Store build. CI builds an installable APK on every push:

1. Open [Actions](../../actions) and pick the most recent green run.
2. Download the `weatherpaper-apks-…` artifact and unzip it.
3. Sideload `app-release.apk` (already signed, R8-shrunk) onto your phone.
4. **Settings › Wallpaper › Live wallpapers › WeatherPaper**, then open its settings to choose a
   location and configure the readout.

## Why it is small

No third-party dependencies at all — no AndroidX, no Compose, no Retrofit, no OkHttp, no JSON
library, no WorkManager, no Play Services. Everything comes from the Android framework:
`WallpaperService`, `Canvas`, `HttpURLConnection`, `org.json`, `LocationManager` and
`SharedPreferences`. `android.useAndroidX=false` keeps it that way, and CI fails the build if the
release APK ever passes 1 MB.

## Why it is cheap to run

- The scene renders into a small buffer (~260px tall) and is blitted at an **integer** scale.
- Sky, distant treeline, ground and pool, plus each swaying tree layer, live in **cached
  buffers** rebuilt only when the weather actually changes. A frame is four buffer copies at
  their sway offsets plus the live weather effects.
- The loop runs at **~12fps**, which reads as deliberate for pixel art.
- A calm, dry, cloudless scene **stops redrawing entirely** — or wakes once a minute if the clock
  is showing. Nothing runs at all while the wallpaper is hidden, and power-save forces static.
- **No background work**: weather is fetched only when the wallpaper becomes visible and the
  cached reading is over 30 minutes old. No jobs, no alarms, no wakeups.

## Working on the art

`art/scene.json` is the single source of truth — palette, sky ramps, season tints, layer layout
and the font. It feeds both the preview and the generated Kotlin, so what you approve is what
ships.

```sh
node tools/shoot.js          # PNG contact sheets of every state -> art/shots/
node tools/gen-thumb.js      # regenerate the wallpaper picker thumbnail
node tools/build-preview.js  # self-contained preview page -> tools/preview/index.html
node tools/gen-kotlin.js     # regenerate Art.kt and PixelFont.kt
```

Open `tools/preview/index.html` in a browser to drive every state with sliders. After editing
the spec, **re-run `gen-kotlin.js`** — `Art.kt` and `PixelFont.kt` are generated and must never
be edited by hand.

The renderer is split the same way in both languages, so changes port one-to-one:

| Reference (`tools/`) | Android (`scene/`) | |
|---|---|---|
| `render.js` | `Draw.kt` | colour, ramps, PRNG, dithering |
| `scene.js` | `Palette.kt`, `Sky.kt` | state → colour, sky, stars, sun/moon |
| `forest.js` | `Forest.kt` | pines, depth layers, ground, scrub, pool |
| `weather.js` | `Precipitation.kt` | cloud, rain, snow, fog, lightning |
| `overlay.js` | `Overlay.kt` | outlined pixel text |
| `compose.js` | `SceneRenderer.kt` | pass order and layer caching |

Colour goes through one indirection: sprites carry shade *indices*, and `SceneContext` resolves
them once per state change into a small palette per depth layer. That is why foliage turns
blue-black at night and warm at golden hour, and why seasons need no extra sprites.

## Credits

Weather data by [Open-Meteo](https://open-meteo.com) (CC BY 4.0). No API key, no account.
