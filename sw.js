// Service worker : met le jeu en cache pour qu'il se lance hors connexion.
const CACHE = 'nuee-v3';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/main.js', 'src/game.js', 'src/flock.js', 'src/levels.js', 'src/audio.js', 'src/save.js', 'src/util.js', 'src/sprites.js',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-180.png',
  'assets/fonts/fraunces-latin-400-italic.woff2', 'assets/fonts/fraunces-latin-600-normal.woff2',
  'assets/fonts/outfit-latin-400-normal.woff2', 'assets/fonts/outfit-latin-600-normal.woff2',
];

self.addEventListener('install', (e) => {
  // addAll échoue si un fichier manque (ex. version empaquetée) : on tolère les absents
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // réseau d'abord (mises à jour immédiates), cache en secours hors ligne
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
