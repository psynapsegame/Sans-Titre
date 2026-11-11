# Nuée

**Un voyage de mille ailes.** Jeu mobile à un doigt, vu de dessus : tu guides une nuée d'oiseaux migrateurs
à travers cinq ciels.

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

Rendu 2D stylisé (Canvas 2D), pensé pour rester lisible sur un petit écran : ciels en dégradé, silhouettes nettes.

- **Oiseaux, faucon, plumes, conifères, aiguilles rocheuses** : sprites rendus à partir de modèles 3D originaux
  (Blender Cycles), puis teintés par le jeu selon le chapitre et le plumage. Les oiseaux ont un vrai cycle de
  battement d'ailes (8 images).
- **Nuages et orages** : nuages volumétriques pré-rendus, teintés par chapitre.
- **Falaises** : texture de roche en aplats, liseré clair, ombre portée, bosquets avec ombres.
- Une version 3D temps réel a été essayée puis abandonnée (moins lisible, incompatible avec certains
  téléphones) ; elle reste consultable sous l'étiquette git `rendu-3d`.

Origine et licence de chaque asset : [`assets/CREDITS.md`](assets/CREDITS.md).

## Lancer le jeu

Aucune compilation n'est nécessaire : c'est un site statique.

```bash
npm start            # sert le dossier sur http://localhost:8080
```

Pour jouer sur un téléphone, héberge le dossier (ou `dist/` après `npm run build`) en HTTPS, puis :

- **Android (Chrome)** : menu ⋮ → *Installer l'application*
- **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*

## Construire

```bash
npm install
npm run build        # dist/index.html : page autonome (code, styles, polices et sprites intégrés)
```

## Publier sur les stores (Capacitor)

```bash
npm run cap:init     # installe Capacitor et crée les projets android/ et ios/
npm run cap:sync     # reconstruit dist/ et le copie dans les projets natifs
```

Reste à fournir : comptes développeur Google Play / Apple, signature, fiche de store, politique de
confidentialité (le jeu ne collecte aucune donnée).

## Refaire les sprites

```bash
pip install bpy pillow                                             # Blender en module Python
python tools/assets/make_models.py -- art/models                   # modèles 3D (GLB)
python tools/assets/make_clouds.py -- rendus/clouds 512 80         # nuages volumétriques
python tools/assets/make_sprites.py -- art/models rendus           # sprites vus de dessus
python tools/assets/pack_sprites.py rendus art/src assets/sprites  # planches prêtes pour le jeu
```

## Organisation

```
index.html          structure des écrans
styles.css          interface
src/main.js         navigation, progression, boucle principale
src/game.js         simulation d'un vol et rendu
src/sprites.js      chargement et teinte des sprites
src/flock.js        la nuée (boids : séparation, alignement, attraction)
src/levels.js       chapitres, niveaux, plumages, générateur de parcours
src/audio.js        bande-son synthétisée
src/save.js         sauvegarde locale
assets/sprites/     sprites du jeu
art/                sources : modèles 3D, texture, atlas de nuages
tools/              empaquetage, production des sprites
```

## Technologies

JavaScript natif (modules ES), Canvas 2D, Web Audio, PWA (manifest + service worker), esbuild, Capacitor pour
l'enveloppe native, Blender pour la production des sprites. Aucune dépendance à l'exécution.
