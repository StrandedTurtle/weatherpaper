#!/usr/bin/env sh
# Build the v2 depth split into art/scene-v2.aseprite.
#
#   art/rebuild-v2.sh [paletteSize]           build and verify v2
#   art/rebuild-v2.sh --promote               make v2 the art the app ships
#
# Without --promote this touches NOTHING the app uses: art/layers, the drawable
# resources and art/scene.aseprite are all left on v1. The picture is identical
# either way - v1 and v2 are the same reduction, cut into different planes.
set -eu
cd "$(dirname "$0")/.."
ASEPRITE="${ASEPRITE:-$HOME/.local/share/Steam/steamapps/common/Aseprite/aseprite}"
[ -x "$ASEPRITE" ] || { echo "aseprite not found at $ASEPRITE (set ASEPRITE=)" >&2; exit 1; }

PROMOTE=no
[ "${1:-}" = "--promote" ] && { PROMOTE=yes; shift; }

echo "==> reducing the reference"
node art/reduce-reference.js "${1:-40}"
echo "==> splitting into v2 depth planes"
node art/split-layers-v2.js
echo "==> building art/scene-v2.aseprite"
SP=art/.build/v2 SPRITE="$PWD/art/scene-v2.aseprite" node art/build-aseprite.js

if [ "$PROMOTE" = yes ]; then
  echo "==> promoting v2 to the shipped art"
  cp art/scene-v2.aseprite art/scene.aseprite
  rm -f art/layers/*.png
  "$ASEPRITE" -b art/scene.aseprite --split-layers --ignore-empty --save-as 'art/layers/{layer}.png'
  node tools/import-layers.js
  node tools/gen-kotlin.js
  node tools/gen-thumb.js
else
  echo "==> exporting v2 for inspection only (art/.build/v2/layers)"
  rm -rf art/.build/v2/layers && mkdir -p art/.build/v2/layers
  "$ASEPRITE" -b art/scene-v2.aseprite --split-layers --ignore-empty \
    --save-as 'art/.build/v2/layers/{layer}.png'
fi
echo "==> done"
