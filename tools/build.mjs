// Empaquette le jeu dans dist/ :
//  - dist/index.html      page autonome (CSS, JS et polices intégrés) + fichiers PWA → hébergement ou Capacitor
//  - dist/nuee-embed.html fragment sans <html>/<head>, pour les hôtes qui fournissent leur propre squelette
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(root, ...p);

const js = (await build({ entryPoints: [at('src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2019', write: false })).outputFiles[0].text;

let css = await readFile(at('styles.css'), 'utf8');
for (const m of [...css.matchAll(/url\((assets\/fonts\/[^)]+)\)/g)]) {
  const b64 = (await readFile(at(m[1]))).toString('base64');
  css = css.replace(m[0], `url(data:font/woff2;base64,${b64})`);
}

const html = await readFile(at('index.html'), 'utf8');
const app = html.slice(html.indexOf('<!--APP-->') + 10, html.indexOf('<!--/APP-->')).trim();
const head = html.slice(html.indexOf('<meta charset'), html.indexOf('<link rel="stylesheet"')).trim();
const script = `<script>window.__NUEE_SINGLE__=${'%S%'};${js.replace(/<\/script/g, '<\\/script')}</script>`;

await rm(at('dist'), { recursive: true, force: true });
await mkdir(at('dist/assets'), { recursive: true });

await writeFile(at('dist/index.html'),
  `<!doctype html>\n<html lang="fr">\n<head>\n${head}\n<style>${css}</style>\n</head>\n<body>\n${app}\n${script.replace('%S%', 'false')}\n</body>\n</html>\n`);
for (const f of ['manifest.webmanifest', 'sw.js']) await cp(at(f), at('dist', f));
for (const f of ['icon-180.png', 'icon-192.png', 'icon-512.png']) await cp(at('assets', f), at('dist/assets', f));

// L'hôte applique déjà les marges de sécurité haut/bas : on neutralise les nôtres.
await writeFile(at('dist/nuee-embed.html'),
  `<title>Nuée</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>${css}\n:root{--sat:0px;--sab:0px}</style>\n${app}\n${script.replace('%S%', 'true')}\n`);

console.log('dist/ prêt');
