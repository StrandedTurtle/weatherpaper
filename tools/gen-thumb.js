'use strict';
// Builds the tile shown in Android's wallpaper picker.
//
// It copies one of the finished frames rather than recompositing the source layers, so the tile
// is by construction a frame that actually ships - it cannot drift from the artwork, and it
// cannot go stale when the relight changes. Golden hour, because the picker shows it small and
// among competitors, and the night frame is nearly black at that size.
//
// Falls back to a plain placeholder when no frames have been imported yet.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'app/src/main/res/drawable-nodpi/wallpaper_thumb.png');
const FRAMES = path.join(ROOT, 'art/frames');

/** First match wins. */
const PREFERRED = ['golden-clear.png', 'midday-clear.png', 'morning-clear.png'];

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const available = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter(f => f.endsWith('.png')) : [];
const pick = PREFERRED.find(f => available.includes(f)) || available.sort()[0];

if (!pick) {
  const w = 96, h = 192, rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = 0x10; rgb[i * 3 + 1] = 0x13; rgb[i * 3 + 2] = 0x14; }
  fs.writeFileSync(OUT, encodePNG(rgb, w, h, 2));
  console.log('thumbnail: placeholder (no frames imported)');
} else {
  fs.copyFileSync(path.join(FRAMES, pick), OUT);
  console.log('thumbnail: ' + pick + ' (' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB)');
}
