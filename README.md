# WeatherPaper

A pixel-art live wallpaper for Android, built to be tiny and to cost almost nothing to run.

The artwork is hand-drawn and imported as layered PNGs. **The scene has not been drawn yet** —
the app currently ships a placeholder and waits for art. See [ART.md](ART.md).

---

## What the app does today

- Composites a stack of PNG layers back to front, scaled by a **whole number** so the pixels stay
  square, then crops to the screen. The canvas size comes from the artwork, not from the code.
- Fetches local weather from [Open-Meteo](https://open-meteo.com) and shows an optional readout —
  clock, temperature, condition, place name — on the **home screen only**, positioned by dragging.
- Optional per-layer parallax on home-screen swipe and idle drift, off by default.

**Weather does not drive the artwork yet.** The data is fetched and the scene state is computed,
but how a drawing should respond to time of day, season and weather depends on how it is drawn —
so that is deliberately left open until the art exists.

## Installing

There is no Play Store build. CI produces an installable APK on every push:

1. Open [**Actions**](../../actions) and pick the most recent green run.
2. Download the `weatherpaper-apks-…` artifact and unzip it.
3. Sideload `app-release.apk` — already signed and R8-shrunk.
4. **Settings › Wallpaper › Live wallpapers › WeatherPaper**.

The artifact name carries the release APK's size.

---

## Why it is small

Zero third-party dependencies. No AndroidX, no Compose, no Retrofit, no OkHttp, no JSON library,
no WorkManager, no Play Services. Everything comes from the Android framework:

`WallpaperService` · `Canvas` · `BitmapFactory` · `HttpURLConnection` · `org.json` ·
`LocationManager` · `SharedPreferences`

`android.useAndroidX=false` keeps it that way, and CI **fails the build** if the release APK ever
passes 1 MB.

## Why it is cheap to run

- Nothing runs while the wallpaper is hidden.
- A still scene **stops redrawing entirely** — or wakes once a minute if the clock is showing.
  Only layers with drift set run a loop, at ~12fps, and power-save forces static.
- **No background work at all.** Weather is fetched only when the wallpaper becomes visible and
  the cached reading is over 30 minutes old. No jobs, no alarms, no wakeups. The last reading is
  persisted, so the first frame after a reboot is never blank.

## Privacy

Location is optional. Without the permission you pick a place by name, and nothing leaves the
device except a latitude and longitude sent to Open-Meteo. With it, the app uses the framework's
*last known* coarse fix and never requests an active GPS fix. No analytics, no account, no API
key, no traffic beyond the weather lookup.

---

## Working on it

```sh
node tools/import-layers.js               # art/layers/*.png -> manifest + app resources
node tools/gen-kotlin.js                  # -> scene/Layers.kt, scene/PixelFont.kt
node tools/gen-thumb.js                   # wallpaper picker tile
node tools/preview-layers.js 1080 2400    # flatten and crop as a phone would, without building
```

Node 18+ only; there are no npm dependencies. To build the app locally you need JDK 17 and the
Android SDK, then `./gradlew assembleRelease`. `minSdk 26`, `targetSdk 35`.

```
app/src/main/java/com/sylcolabs/weatherpaper/
  WeatherPaperService.kt   the wallpaper, frame loop and cost control
  SceneStates.kt           observation + clock -> scene state
  Prefs.kt                 all persisted state
  scene/                   layer compositing, the readout, the bitmap font
  weather/                 Open-Meteo client, location, caching
  ui/                      settings, and the live drag-to-position preview
art/layers/                your exported PNGs go here
tools/                     importers and generators
```

`scene/Layers.kt` and `scene/PixelFont.kt` are **generated** — edit `art/layers.json` and
`art/font.json` and re-run the generator instead.

---

## Credits

Weather data by [**Open-Meteo**](https://open-meteo.com), used under CC BY 4.0. No API key and no
account required.
