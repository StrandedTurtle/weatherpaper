#!/usr/bin/env sh
# Rebuild the scene from forest-cabin-reference.png, end to end.
#
#   art/rebuild.sh [paletteSize]      default 40
#
# art/scene.aseprite is GENERATED OUTPUT - this overwrites it. The scripts are
# the source of truth. If you start editing the sprite by hand, say so, because
# then that relationship inverts.
#
# The shipping cut is v3 (art/split-layers-v3.js). art/rebuild-v2.sh still builds
# the earlier cuts side by side for comparison; neither touches what the app uses.
#
# ASEPRITE overrides the editor binary - Steam builds are not on PATH.
set -eu
cd "$(dirname "$0")/.."

ASEPRITE="${ASEPRITE:-$HOME/.local/share/Steam/steamapps/common/Aseprite/aseprite}"
[ -x "$ASEPRITE" ] || { echo "aseprite not found at $ASEPRITE (set ASEPRITE=)" >&2; exit 1; }

echo "==> reducing the reference"
node art/reduce-reference.js "${1:-40}"
echo "==> splitting into depth planes (v3)"
node art/split-layers-v3.js
cp art/.build/v3/scene-meta.json art/scene-meta.json
echo "==> building art/scene.aseprite"
SP=art/.build/v3 SPRITE="$PWD/art/scene.aseprite" node art/build-aseprite.js

echo "==> exporting layers (trim OFF - every layer must stay 160x288)"
rm -f art/layers/*.png
"$ASEPRITE" -b art/scene.aseprite --split-layers --ignore-empty --save-as 'art/layers/{layer}.png'

echo "==> importing and generating"
node tools/import-layers.js
node art/apply-parallax.js          # parallax per plane, from scene-meta.json
node tools/gen-kotlin.js
node tools/gen-thumb.js
echo "==> done"
