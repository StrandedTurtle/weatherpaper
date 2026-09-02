'use strict';
// Renders the wallpaper picker thumbnail from the real scene, so the tile in Android's
// wallpaper list is the actual art rather than a hand-drawn stand-in.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png.js');
const C = require('./compose.js');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../art/scene.json'), 'utf8'));

// Golden hour shows off the sky ramp, the silhouettes and the pool reflection at once.
const state = {
  hour: 19.1, sunrise: 6.2, sunset: 19.8, cloud: 0.25, precip: 'none',
  wind: 0.2, season: 'autumn', condition: 'auto', tempC: 13, date: new Date('2026-09-02'),
};

const w = 132, h = 264, scale = 3;
const { frame } = C.renderScene(spec, state, w, h, 1500, {});
const out = path.join(__dirname, '../app/src/main/res/drawable-nodpi/wallpaper_thumb.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePNG(frame.d, w, h, scale));
console.log('thumbnail: ' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB at ' + (w * scale) + 'x' + (h * scale));
