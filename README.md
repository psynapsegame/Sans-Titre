# Nuée

**Un voyage de mille ailes.** Jeu mobile à un doigt : tu guides une nuée d'oiseaux migrateurs à travers cinq ciels.

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

## Lancer le jeu

Aucune compilation n'est nécessaire : c'est un site statique.

```bash
npm start            # sert le dossier sur http://localhost:8080
```

Pour jouer sur ton téléphone : ouvre l'adresse de ton ordinateur (même Wi-Fi), ou héberge le dossier
(GitHub Pages : *Settings → Pages → Deploy from a branch*, dossier racine). Une fois la page ouverte en HTTPS :

- **Android (Chrome)** : menu ⋮ → *Installer l'application*
- **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*

Le jeu s'ouvre alors en plein écran, comme une application, et fonctionne hors ligne.

## Construire

```bash
npm install
npm run build        # dist/index.html : page autonome (code, styles et polices intégrés)
npm run icons        # régénère les icônes (nécessite Playwright)
```

## Publier sur les stores (Capacitor)

Le projet est prêt à être enveloppé dans une application native :

```bash
npm run cap:init     # installe Capacitor et crée les projets android/ et ios/
npm run cap:sync     # reconstruit dist/ et le copie dans les projets natifs
npx cap open android # puis Android Studio → Generate Signed Bundle
npx cap open ios     # puis Xcode → Archive (Mac requis)
```

Reste à fournir pour une mise en ligne : comptes développeur Google Play / Apple, signature,
captures d'écran et fiche de store, politique de confidentialité (le jeu ne collecte aucune donnée).

## Organisation

```
index.html          structure des écrans
styles.css          identité visuelle et interface
src/main.js         navigation, progression, boucle principale
src/game.js         simulation d'un vol et rendu canvas
src/flock.js        la nuée (boids : séparation, alignement, attraction)
src/levels.js       chapitres, niveaux, plumages, générateur de parcours
src/audio.js        bande-son synthétisée
src/save.js         sauvegarde locale
sw.js               cache hors ligne
tools/              empaquetage et génération des icônes
```

## Technologies

JavaScript natif (modules ES), Canvas 2D, Web Audio, PWA (manifest + service worker), esbuild pour
l'empaquetage, Capacitor pour l'enveloppe native. Aucune dépendance à l'exécution.
Polices : Fraunces et Outfit (licence SIL Open Font).
