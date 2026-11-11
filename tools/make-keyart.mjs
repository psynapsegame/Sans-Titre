// Capture les visuels d'interface directement dans le moteur du jeu (cartes de chapitre, aperçus de plumage, icônes).
// Usage : servir le dossier (npm start), puis : node tools/make-keyart.mjs [url]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'http://localhost:8080/index.html';
const SKINS = ['etourneau', 'luciole', 'grue', 'flamant', 'braise', 'aurore'];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2 })).newPage();
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.goto(url);
await p.waitForFunction(() => document.getElementById('loader').hidden, null, { timeout: 120000 });
await p.addStyleTag({ content: '#stage > :not(canvas) { display: none !important; }' });

// fige le temps réel et avance la simulation à pas fixes, pour des images reproductibles
const shoot = (ci, skin, sec, look) => p.evaluate(async ([ci, skin, sec, look]) => {
  const N = window.__nuee, g = N.game, R = N.renderer; N.freeze = true; N.noRender = true;
  await R.setChapter(ci, skin, ['#191330', '#14202b', '#f1f4f7', '#4a3140', '#dffff4'][ci]);
  g.start({ mode: 'attract', ci, skin });
  if (look) Object.assign(R.camP, look), R.placeCamera();
  for (let i = 0; i < sec * 60; i++) { g.update(1 / 60); if (i % 30 === 0) R.frame(g, 0.5); }
  R.frame(g, 1 / 60); R.frame(g, 0);
  const pt = R.project(g.flock.cx, g.flock.cy);
  return pt;
}, [ci, skin, sec, look]);

for (let ci = 0; ci < 5; ci++) {
  await shoot(ci, 'etourneau', 9);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(root, 'assets/ui', `ch${ci}.jpg`), type: 'jpeg', quality: 86, clip: { x: 0, y: 92, width: 432, height: 264 }, timeout: 180000 });
  console.log('chapitre', ci);
}
for (const skin of SKINS) {
  const pt = await shoot(skin === 'luciole' || skin === 'aurore' ? 4 : skin === 'braise' ? 3 : 0, skin, 5);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(root, 'assets/ui', `skin-${skin}.jpg`), type: 'jpeg', quality: 86, clip: { x: Math.max(0, Math.min(432 - 180, pt.x - 90)), y: pt.y - 60, width: 180, height: 108 }, timeout: 180000 });
  console.log('plumage', skin);
}
// icône : la nuée devant le couchant
const pt = await shoot(3, 'etourneau', 6);
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(root, 'assets', 'icon-src.png'), clip: { x: Math.max(0, Math.min(432 - 256, pt.x - 128)), y: pt.y - 150, width: 256, height: 256 }, timeout: 180000 });
await b.close();
console.log('visuels générés');
