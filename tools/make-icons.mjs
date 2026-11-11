// Génère les icônes de l'application à partir du jeu lui-même (capture de l'écran-titre, nuée devant le soleil).
// Usage : servir le dossier (npm start), puis : node tools/make-icons.mjs [url]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch();
for (const size of [512, 192, 180]) {
  const p = await b.newPage({ viewport: { width: 260, height: 560 }, deviceScaleFactor: size / 150 });
  await p.goto(process.argv[2] || 'http://localhost:8080/index.html');
  await p.waitForFunction(() => document.getElementById('loader').hidden);
  await p.addStyleTag({ content: '#stage > :not(canvas) { display: none !important; }' });
  // la nuée se place au-dessus du soleil, ailes resserrées
  const pt = await p.evaluate(() => new Promise((res) => { const g = window.__nuee.game, f = g.flock; g.idle = 0; g.holding = true;
    f.tx = 195 * 0.9; f.ty = g.VH * 0.66; setTimeout(() => res({ x: f.cx * 260 / 390, y: f.cy * 260 / 390 }), 2600); }));
  await p.screenshot({ path: path.join(root, 'assets', `icon-${size}.png`), clip: { x: Math.max(0, Math.min(260 - 150, pt.x - 52)), y: Math.min(560 - 150, pt.y - 48), width: 150, height: 150 } });
  await p.close();
}
await b.close();
console.log('icônes générées');
