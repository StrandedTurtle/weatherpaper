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

# This script REGENERATES art/layers/ from the reference image, overwriting whatever is there.
# It is only meaningful if you still have the reference and still want the art derived from it;
# if the planes have since been drawn or edited by hand, running this destroys that work.
[ -f art/forest-cabin-reference.png ] || {
  echo "art/forest-cabin-reference.png is not in the repo, so there is nothing to reduce." >&2
  echo "The nine planes in art/layers/ are the source now - relight them with:" >&2
  echo "  node art/relight.js && node tools/import-frames.js && node tools/gen-kotlin.js" >&2
  exit 1
}

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
node art/relight.js
node tools/import-frames.js
node tools/gen-kotlin.js
node tools/gen-thumb.js
node tools/preview-weather.js     # art/preview/weather.png + seasons.png
echo "==> done"
