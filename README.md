# WeatherPaper

A pixel-art live wallpaper for Android, built to be tiny and to cost almost nothing to run.

The scene is a 160×288 night forest clearing with a cabin, reduced from a reference painting
and cut into nine depth planes. See [ART.md](ART.md).

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

## Installing on your phone

There is no Play Store build. Every push to `main` produces a signed, R8-shrunk
APK in CI, and that is the one to sideload.

**1. Get the APK**

1. Open [**Actions**](../../actions) and click the most recent run with a green tick.
2. Scroll to **Artifacts** at the bottom and download `weatherpaper-apks-…`.
   The artifact name carries the release APK's size, so you can sanity-check it
   before downloading.
3. Unzip it. You want **`app-release.apk`** — already signed, so it installs as-is.
   (`app-debug.apk` is also in there; ignore it unless you are debugging.)

GitHub only lets signed-in users download artifacts, and they expire after 90
days. Re-run the workflow if you come back to a stale one.

**2. Put it on the phone**

Any of these work — pick whichever you already have:

- **USB:** `adb install -r app-release.apk`
- **No cable:** upload to Drive/Dropbox, or email it to yourself, and open it on
  the phone.

Android will ask you to allow installs from whatever app you opened it with
(Files, Chrome, Drive). That prompt is expected for any sideloaded APK; grant it
for that app only. Play Protect may also warn that it does not recognise the
developer — that is what an unknown signing key looks like, and **Install anyway**
is the way past it.

**3. Set it as your wallpaper**

**Settings › Wallpaper › Live wallpapers › WeatherPaper**, then **Set wallpaper**.

Some launchers instead want a long-press on the home screen → **Wallpapers** →
**Live wallpapers**. Samsung hides it under **Settings › Wallpaper and style ›
Change wallpaper › Live wallpaper**.

**4. Configure it**

The settings screen opens from the **Settings** button in the wallpaper picker,
or from the **WeatherPaper** icon in your app drawer. From there you can:

- give it location permission, or type a place name if you would rather not
- turn the clock, temperature, condition and place name on or off
- drag the readout to where you want it, live over the artwork
- switch between 12- and 24-hour time

Location is optional. Without the permission nothing leaves the device but a
latitude and longitude sent to Open-Meteo for the place you named.

---

## Previewing on the desktop

```sh
node tools/make-preview.js        # -> art/preview/preview.html
```

One self-contained file — the nine layers, the scene metadata and the readout
font are all inlined, so it opens straight off disk with no server. It renders
the scene exactly as `SceneRenderer.kt` does: same whole-number scale, same
bottom-anchored crop, same per-layer parallax offset. Verified against
`tools/preview-layers.js` at zero differing pixels.

It gives you a phone-accurate crop across six screen shapes, a swipe slider (and
an auto-swipe) to see the parallax move, per-plane visibility and solo, guide
overlays for the horizon, moon, cabin openings and safe area, and a draggable
readout so you can pick its position before touching the phone.

`art/rebuild.sh` regenerates it along with everything else.

There is also a quick static render, if you just want a PNG:

```sh
node tools/preview-layers.js 1080 2400
```

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
