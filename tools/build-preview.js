'use strict';
// Inlines the renderer modules and scene.json into a single self-contained preview page,
// so the preview can never drift from the code that ships.
const fs = require('fs');
const path = require('path');

const here = __dirname;
const ORDER = ['render.js', 'scene.js', 'forest.js', 'weather.js', 'overlay.js', 'compose.js'];

const modules = ORDER.map(function (f) {
  return '/* ---- ' + f + ' ---- */\n' + fs.readFileSync(path.join(here, f), 'utf8');
}).join('\n');

const spec = fs.readFileSync(path.join(here, '../art/scene.json'), 'utf8');
const tpl = fs.readFileSync(path.join(here, 'preview/template.html'), 'utf8');

const out = tpl
  .replace('/*__MODULES__*/', function () { return modules; })
  .replace('/*__SPEC__*/', function () { return spec; });

const dest = path.join(here, 'preview/index.html');
fs.writeFileSync(dest, out);
console.log('preview built: ' + dest + '  (' + (out.length / 1024).toFixed(1) + ' KB)');
