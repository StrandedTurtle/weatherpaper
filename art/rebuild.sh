#!/usr/bin/env sh
# Rebuild the whole scene from forest-cabin-reference.png, end to end.
#
#   art/rebuild.sh [paletteSize]
#
# art/scene.aseprite is generated output - this overwrites it. The reduction and
# the layer split are the source of truth.
#
# ASEPRITE overrides the editor binary (Steam builds are not on PATH).
set -eu
cd "$(dirname "$0")/.."

ASEPRITE="${ASEPRITE:-$HOME/.local/share/Steam/steamapps/common/Aseprite/aseprite}"
[ -x "$ASEPRITE" ] || { echo "aseprite not found at $ASEPRITE (set ASEPRITE=)" >&2; exit 1; }

echo "==> reducing the reference"
node art/reduce-reference.js "${1:-40}"
echo "==> splitting into depth layers"
node art/split-layers.js
echo "==> building art/scene.aseprite"
node art/build-aseprite.js

echo "==> exporting layers (trim OFF - every layer must stay 160x288)"
rm -f art/layers/*.png
"$ASEPRITE" -b art/scene.aseprite --split-layers --ignore-empty --save-as 'art/layers/{layer}.png'

echo "==> importing and generating"
node tools/import-layers.js
node tools/gen-kotlin.js
node tools/gen-thumb.js
echo "==> done"
