// Génère les icônes de l'application (PNG) avec le Chromium de Playwright.
// Usage : node tools/make-icons.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const draw = (size) => `
<canvas id="c" width="${size}" height="${size}"></canvas>
<script>
const S=${size}, g=document.getElementById('c').getContext('2d');
const gr=g.createLinearGradient(0,0,0,S);
[['#232a5c',0],['#7d4f86',.38],['#ee8c6c',.72],['#ffd7a0',1]].forEach(([c,p])=>gr.addColorStop(p,c));
g.fillStyle=gr; g.fillRect(0,0,S,S);
let rg=g.createRadialGradient(S*.68,S*.76,0,S*.68,S*.76,S*.6);
rg.addColorStop(0,'rgba(255,177,105,.7)'); rg.addColorStop(1,'rgba(255,177,105,0)'); g.fillStyle=rg; g.fillRect(0,0,S,S);
g.fillStyle='#fff3d0'; g.beginPath(); g.arc(S*.68,S*.76,S*.13,0,7); g.fill();
g.fillStyle='#191330';
let seed=11; const r=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
for(let i=0;i<120;i++){
  const a=i*2.39996, rad=S*(.018+Math.sqrt(i)*.026);
  const x=S*.46+Math.cos(a)*rad*1.05+ (r()-.5)*S*.02, y=S*.44+Math.sin(a)*rad*.92+(r()-.5)*S*.02;
  const d=a+1.75+(r()-.5)*.5, ux=Math.cos(d), uy=Math.sin(d), fl=.4+.6*r();
  const l=S*.03, w=S*.028*fl, px=-uy*w, py=ux*w, bx=x-ux*l*.55, by=y-uy*l*.55;
  g.beginPath(); g.moveTo(x+ux*l,y+uy*l); g.lineTo(bx+px,by+py); g.lineTo(x-ux*l*.1,y-uy*l*.1); g.lineTo(bx-px,by-py); g.fill();
}
</script>`;

const b = await chromium.launch();
for (const size of [512, 192, 180]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0">${draw(size)}</body>`);
  await p.locator('#c').screenshot({ path: path.join(root, 'assets', `icon-${size}.png`) });
  await p.close();
}
await b.close();
console.log('icônes générées');
