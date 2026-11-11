# Crédits et licences des assets

## Textures PBR (scans) — Poly Haven, CC0 1.0 (domaine public)

| Fichier | Asset | Source |
| --- | --- | --- |
| `tex/rock_face_diff.jpg`, `tex/rock_face_nor.jpg` | Rock Face 03 — Dario Barresi (photographie), Rico Cilliers (traitement) | https://polyhaven.com/a/rock_face_03 |
| `tex/aerial_rocks_diff.jpg`, `tex/aerial_rocks_nor.jpg` | Aerial Rocks 02 — Rob Tuytel | https://polyhaven.com/a/aerial_rocks_02 |
| `tex/aerial_beach_diff.jpg`, `tex/aerial_beach_nor.jpg` | Aerial Beach 01 — Rob Tuytel | https://polyhaven.com/a/aerial_beach_01 |
| `tex/boulder_cracked_diff.jpg` | Rock Boulder Cracked | https://polyhaven.com/a/rock_boulder_cracked |

Fichiers 1k récupérés depuis les exemples du moteur PlayCanvas (dépôt MIT, qui documente ces textures comme CC0),
puis recompressés sans modification du contenu.

## Ciels HDR — Poly Haven, CC0 1.0

| Fichier | Asset | Source |
| --- | --- | --- |
| `sky/aube.jpg` | Kiara 1 Dawn | https://polyhaven.com/a/kiara_1_dawn |
| `sky/gorges.jpg` | Quarry 01 | https://polyhaven.com/a/quarry_01 |
| `sky/orage.jpg` | Blouberg Sunrise 2 | https://polyhaven.com/a/blouberg_sunrise_2 |
| `sky/mer.jpg` | Venice Sunset | https://polyhaven.com/a/venice_sunset |
| `sky/boreale.jpg` | Dikhololo Night | https://polyhaven.com/a/dikhololo_night |

HDRI 1k récupérés depuis les dépôts three.js et pmndrs/drei-assets, puis recadrés (le ciel est étiré jusqu'à
l'horizon), normalisés en exposition et réencodés (voir `tools/assets/process.py`).

## Carte de normales de l'eau

`tex/water_nor.jpg` — `waternormals.jpg` des exemples three.js (https://github.com/mrdoob/three.js, licence MIT).

## Créations originales de ce projet

- `models/bird.glb`, `models/falcon.glb`, `models/feather.glb`, `models/stack0-2.glb` : modélisés dans Blender
  par script (`tools/assets/make_models.py`).
- `tex/clouds.webp` : nuages volumétriques rendus avec Blender Cycles (`tools/assets/make_clouds.py`).
- `tex/moon.webp` : lune rendue avec Blender Cycles (`tools/assets/make_moon.py`).
- `ui/*.jpg`, icônes : captures du moteur du jeu (`tools/make-keyart.mjs`).

## Code et polices

- three.js — licence MIT.
- Fraunces, Outfit — SIL Open Font License 1.1.

## Asset écarté

Les oiseaux animés des exemples three.js (Stork, Parrot, Flamingo, issus de « ROME ») sont diffusés sous
CC BY-NC-SA : usage commercial interdit. Ils ne sont pas utilisés ; les oiseaux du jeu sont des modèles originaux.
