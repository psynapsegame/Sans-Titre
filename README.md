# Nuée

**Un voyage de mille ailes.** Jeu mobile à un doigt, en 3D temps réel : tu guides une nuée d'oiseaux migrateurs
au-dessus de la mer, à travers cinq ciels.

- **Pose le doigt** n'importe où et glisse : la nuée te suit et **se resserre** (pour franchir les gorges).
- **Lâche** : la nuée **se disperse** (pour esquiver le faucon).
- Chaque oiseau compte : la taille de la nuée est à la fois ta vie et ton score.

## Contenu

- 5 chapitres, 20 niveaux (Aube sur les marais, Gorges d'ocre, Front d'orage, Mer du soir, Nuit boréale)
- Dangers : gorges sinueuses, aiguilles rocheuses, faucons en piqué, orages à foudre, vent de travers
- Oiseaux égarés à rallier, plumes dorées à ramasser, 3 étoiles par niveau
- 6 plumages à débloquer, mode « migration sans fin » avec record
- Musique et bruitages générés en direct (Web Audio), retours haptiques sur Android
- Sauvegarde locale automatique, jouable hors connexion une fois installé

## Direction artistique et rendu

Le jeu est rendu en WebGL 2 avec three.js. La simulation (2D, déterministe) est séparée du rendu.

- **Mer** : matériau PBR, trois couches de vagues (carte de normales), reflets du ciel, éclats du soleil,
  anti-crénelage spéculaire au loin.
- **Roche** : falaises des gorges générées le long du parcours, aiguilles modélisées dans Blender ; textures
  PBR photogrammétriques Poly Haven (couleur et normales), assombries et humides vers la ligne d'eau.
- **Ciel et lumière** : un panorama HDR réel par chapitre, utilisé comme fond et comme éclairage d'ambiance ;
  la brume prend la couleur du ciel à l'horizon.
- **Ombres et végétation** : ombres portées du soleil (carte d'ombres) sur la mer, les falaises et la nuée ;
  plateaux habillés de conifères, buissons et blocs rocheux instanciés, enneigés dans la nuit boréale.
- **Oiseaux** : modèle 3D original, instancié (jusqu'à 480), battement d'ailes et inclinaison en virage calculés
  dans le vertex shader.
- **Atmosphère** : nuages volumétriques pré-rendus (Blender Cycles), brumes basses, pluie, éclairs, aurore,
  étoiles, lune.
- **Post-traitement** : rendu HDR, bloom, tone mapping filmique ACES ; la qualité s'adapte à l'appareil
  (résolution, puis ombres, puis bloom).

Origine et licence de chaque asset : [`assets/CREDITS.md`](assets/CREDITS.md).

## Lancer le jeu

```bash
npm install          # three.js et esbuild
npm start            # sert le dossier sur http://localhost:8080
```

Pour une version à héberger (un seul fichier HTML + le dossier `assets/`) :

```bash
npm run build        # produit dist/
```

Héberge `dist/` sur n'importe quel serveur statique en HTTPS (GitHub Pages, Netlify…), puis sur le téléphone :

- **Android (Chrome)** : menu ⋮ → *Installer l'application*
- **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*

Le jeu s'ouvre alors en plein écran et fonctionne hors ligne.

## Publier sur les stores (Capacitor)

```bash
npm run cap:init     # installe Capacitor et crée les projets android/ et ios/
npm run cap:sync     # reconstruit dist/ et le copie dans les projets natifs
npx cap open android # puis Android Studio → Generate Signed Bundle
npx cap open ios     # puis Xcode → Archive (Mac requis)
```

Reste à fournir pour une mise en ligne : comptes développeur Google Play / Apple, signature, captures d'écran
et fiche de store, politique de confidentialité (le jeu ne collecte aucune donnée).

## Refaire les assets

Les fichiers de `assets/` sont versionnés ; cette étape n'est utile que pour les modifier.

```bash
tools/assets/fetch.sh sources/                                  # télécharge textures et HDRI (licences libres)
pip install bpy opencv-python-headless pillow numpy             # Blender en module Python
python tools/assets/make_clouds.py -- sources/clouds 512 80     # nuages volumétriques (Cycles)
python tools/assets/make_moon.py -- sources/moon.png            # lune (Cycles)
python tools/assets/make_models.py -- assets/models             # oiseaux, plume, roches, végétation (GLB)
python tools/assets/process.py sources assets                   # textures, atlas, ciels
npm start & node tools/make-keyart.mjs                          # visuels d'interface et icônes (Playwright)
```

## Organisation

```
index.html            structure des écrans
styles.css            interface
src/main.js           navigation, progression, boucle principale
src/game.js           simulation d'un vol (aucun rendu)
src/render3d.js       moteur de rendu 3D (three.js) et direction artistique par chapitre
src/flock.js          la nuée (boids : séparation, alignement, attraction)
src/levels.js         chapitres, niveaux, plumages, générateur de parcours
src/audio.js          bande-son synthétisée
src/save.js           sauvegarde locale
assets/               textures, ciels, modèles 3D, visuels d'interface
tools/                empaquetage, production des assets
```

## Technologies

three.js (WebGL 2), JavaScript natif en modules ES, Web Audio, PWA (manifest + service worker), esbuild,
Capacitor pour l'enveloppe native, Blender pour la production des assets.
