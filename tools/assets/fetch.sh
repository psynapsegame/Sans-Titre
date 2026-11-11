#!/usr/bin/env bash
# Télécharge les sources des assets (toutes sous licence libre, voir assets/CREDITS.md) dans le dossier donné.
# Usage : tools/assets/fetch.sh <dossier_sources>
set -euo pipefail
out="${1:?dossier de destination}"; mkdir -p "$out"
R=https://raw.githubusercontent.com
PC=$R/playcanvas/engine/main/examples/assets/textures
get() { curl -fsSL --retry 3 -o "$out/$2" "$1"; echo "ok $2"; }
get $PC/terrain/rock_face_03_diff_1k.jpg t-rock_face_03_diff_1k.jpg
get $PC/terrain/rock_face_03_nor_1k.jpg t-rock_face_03_nor_1k.jpg
get $PC/aerial_rocks_02_diff_1k.jpg pc-aerial_rocks_02_diff_1k.jpg
get $PC/terrain/aerial_rocks_02_nor_1k.jpg t-aerial_rocks_02_nor_1k.jpg
get $PC/terrain/aerial_beach_01_diff_1k.jpg t-aerial_beach_01_diff_1k.jpg
get $PC/terrain/aerial_beach_01_nor_1k.jpg t-aerial_beach_01_nor_1k.jpg
get $PC/rock_boulder_cracked_diff_1k.jpg pc-rock_boulder_cracked_diff_1k.jpg
T=$R/mrdoob/three.js/r160/examples/textures
get $T/waternormals.jpg waternormals.jpg
get $T/equirectangular/quarry_01_1k.hdr quarry_01_1k.hdr
get $T/equirectangular/blouberg_sunrise_2_1k.hdr blouberg_sunrise_2_1k.hdr
get $T/equirectangular/venice_sunset_1k.hdr venice_sunset_1k.hdr
D=$R/pmndrs/drei-assets/master/hdri
get $D/kiara_1_dawn_1k.hdr kiara_1_dawn_1k.hdr
get $D/dikhololo_night_1k.hdr dikhololo_night_1k.hdr
echo "Sources prêtes. Ensuite : make_clouds.py, make_moon.py, make_models.py (Blender), puis process.py."
