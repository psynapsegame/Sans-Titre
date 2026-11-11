import { CHAPTERS, SKINS, levelId } from './levels.js';
import { Game } from './game.js';
import { audio, buzz } from './audio.js';
import { save, loadSave, persist } from './save.js';
import { rgba } from './util.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), cv = $('c');
const SCREENS = ['title', 'map', 'skins', 'pause', 'result'];
const TOTAL_STARS = CHAPTERS.length * 4 * 3;
const star = (on) => `<svg class="${on ? 'on' : ''}"><use href="#i-star"/></svg>`;

loadSave();
audio.on = save.sound;

let screen = 'title', paused = false, current = null, hintTimer = 0, introTimer = 0;
let dpr = Math.min(window.devicePixelRatio || 1, 2), slow = 0;

const game = new Game(cv, {
  onHud(n, got, prog, m) {
    $('hudBirds').textContent = n;
    $('hudFeathers').textContent = got;
    if (prog >= 0) $('prog').style.transform = `scaleX(${prog})`;
    else $('hudMeters').textContent = `${m.toLocaleString('fr-FR')} m`;
  },
  onHint(text) {
    const el = $('hint');
    clearTimeout(hintTimer);
    if (!text) { el.classList.remove('on'); return; }
    el.textContent = text; el.classList.add('on');
    hintTimer = setTimeout(() => el.classList.remove('on'), 5200);
  },
  onHurt(v) { $('hurt').style.opacity = v; },
  onEnd: showResult,
});

/* ---------- progression ---------- */
const starsOf = (ci, li) => save.stars[levelId(ci, li)] || 0;
const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
const unlocked = (ci, li) => (ci === 0 && li === 0) || (li > 0 ? starsOf(ci, li - 1) > 0 : starsOf(ci - 1, 3) > 0);
const endlessOpen = () => starsOf(0, 3) > 0;
function nextLevel() {
  for (let ci = 0; ci < CHAPTERS.length; ci++) for (let li = 0; li < 4; li++) if (!starsOf(ci, li)) return { ci, li };
  return null;
}
function after(ci, li) {
  if (li < 3) return { ci, li: li + 1 };
  return ci < CHAPTERS.length - 1 ? { ci: ci + 1, li: 0 } : null;
}

/* ---------- navigation ---------- */
function show(name) {
  screen = name;
  SCREENS.forEach((s) => { $(s).hidden = s !== name; });
  $('hud').hidden = !(name === 'game' || name === 'pause');
}

function refreshTitle() {
  const nx = nextLevel();
  $('tFeathers').textContent = save.feathers;
  $('tStars').textContent = `${totalStars()}/${TOTAL_STARS}`;
  $('playLabel').textContent = totalStars() ? 'Reprendre le voyage' : 'Prendre l’envol';
  $('playSub').textContent = nx ? `${CHAPTERS[nx.ci].num} · ${nx.li + 1} — ${CHAPTERS[nx.ci].levels[nx.li].name}` : 'Voyage accompli · migration sans fin';
  $('endLock').style.display = endlessOpen() ? 'none' : '';
  $('soundUse').setAttribute('href', save.sound ? '#i-sound' : '#i-mute');
  $('btnSound2').textContent = `Son : ${save.sound ? 'activé' : 'coupé'}`;
}

function goTitle() {
  const nx = nextLevel() || { ci: CHAPTERS.length - 1 };
  current = null; paused = false;
  game.start({ mode: 'attract', ci: nx.ci, skin: save.skin });
  setAccent(nx.ci);
  refreshTitle();
  show('title');
}

function setAccent(ci) {
  stage.style.setProperty('--accent', CHAPTERS[ci].accent);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = CHAPTERS[ci].sky[0];
}

function play(mode, ci = 0, li = 0) {
  current = { mode, ci, li };
  paused = false;
  game.start({ mode, ci, li, skin: save.skin });
  setAccent(ci);
  $('hint').classList.remove('on');
  const endless = mode === 'endless';
  $('progWrap').hidden = endless; $('hudMeters').hidden = !endless;
  $('prog').style.transform = 'scaleX(0)';
  $('introNum').textContent = endless ? 'Migration' : `${CHAPTERS[ci].num} · ${li + 1}`;
  $('introName').textContent = endless ? 'Sans fin' : CHAPTERS[ci].levels[li].name;
  $('pauseName').textContent = $('introName').textContent;
  const intro = $('intro');
  intro.classList.add('on');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => intro.classList.remove('on'), 2400);
  show('game');
  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* facultatif */ }
}

function setPaused(v) {
  if (!current || game.state === 'done') return;
  paused = v;
  audio.suspend(v);
  show(v ? 'pause' : 'game');
}

/* ---------- carte du voyage ---------- */
function buildMap() {
  const nx = nextLevel();
  $('mStars').textContent = `${totalStars()}/${TOTAL_STARS}`;
  $('chapters').innerHTML = CHAPTERS.map((ch, ci) => {
    const open = unlocked(ci, 0);
    const lv = ch.levels.map((l, li) => {
      const ok = unlocked(ci, li), st = starsOf(ci, li), isNext = nx && nx.ci === ci && nx.li === li;
      return `<button class="lvl${isNext ? ' next' : ''}" data-l="${ci}-${li}" ${ok ? '' : 'disabled'} aria-label="${l.name}">
        <b>${ok ? li + 1 : '<svg><use href="#i-lock"/></svg>'}</b><span class="s">${star(st > 0)}${star(st > 1)}${star(st > 2)}</span></button>`;
    }).join('');
    return `<article class="chapter${open ? '' : ' locked'}" style="background:linear-gradient(165deg,${ch.sky[0]},${ch.sky[1]} 42%,${ch.sky[2]} 78%,${ch.sky[3]})">
      <span class="num">${ch.num}</span><h3>${ch.name}</h3><p>${ch.blurb}</p><div class="levels">${lv}</div></article>`;
  }).join('');
}

/* ---------- plumages ---------- */
function drawSkinPreview(c, sk) {
  const ch = game.ch, w = (c.width = 320), h = (c.height = 192), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, w, h);
  ch.sky.forEach((col, i) => gr.addColorStop(i / (ch.sky.length - 1), col));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const colors = sk.colors || [ch.ink];
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = 8 + Math.sqrt(i) * 11, x = w / 2 + Math.cos(a) * r * 1.5, y = h / 2 + Math.sin(a) * r * 0.75;
    const d = a + 1.75, ux = Math.cos(d), uy = Math.sin(d) * 0.6, fl = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7));
    if (sk.glow) {
      const rg = g.createRadialGradient(x, y, 0, x, y, 16);
      rg.addColorStop(0, rgba(sk.glow, 0.5)); rg.addColorStop(1, rgba(sk.glow, 0));
      g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.fillRect(x - 16, y - 16, 32, 32); g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = colors[i % colors.length];
    const l = 8, wd = 8 * fl, px = -uy * wd, py = ux * wd, bx = x - ux * l * 0.55, by = y - uy * l * 0.55;
    g.beginPath(); g.moveTo(x + ux * l, y + uy * l); g.lineTo(bx + px, by + py); g.lineTo(x - ux * l * 0.1, y - uy * l * 0.1); g.lineTo(bx - px, by - py); g.fill();
  }
}

function buildSkins() {
  $('sFeathers').textContent = save.feathers;
  const grid = $('skinGrid');
  grid.innerHTML = SKINS.map((sk) => {
    const own = save.owned.includes(sk.id), act = save.skin === sk.id, poor = !own && save.feathers < sk.price;
    const label = act ? 'Portée' : own ? 'Choisir' : `<svg><use href="#i-feather"/></svg>${sk.price}`;
    return `<button class="skin${act ? ' active' : ''}${poor ? ' poor' : ''}" data-s="${sk.id}"><canvas></canvas><div><b>${sk.name}</b><small>${sk.desc}</small><em>${label}</em></div></button>`;
  }).join('');
  grid.querySelectorAll('.skin').forEach((el, i) => drawSkinPreview(el.querySelector('canvas'), SKINS[i]));
}

/* ---------- résultat ---------- */
function showResult(r) {
  save.feathers += r.feathers;
  let stars = 0, record = false;
  const endless = r.mode === 'endless';
  if (endless) {
    record = r.meters > save.endlessBest;
    if (record) save.endlessBest = r.meters;
  } else if (r.win) {
    stars = r.birds >= r.total * 0.7 ? 3 : r.birds >= r.total * 0.45 ? 2 : 1;
    const id = levelId(r.ci, r.li);
    save.stars[id] = Math.max(save.stars[id] || 0, stars);
    record = r.birds > (save.best[id] || 0);
    if (record) save.best[id] = r.birds;
  }
  persist();

  const ch = CHAPTERS[r.ci];
  $('rEyebrow').textContent = endless ? 'Migration sans fin' : `${ch.num} · ${r.li + 1} — ${ch.levels[r.li].name}`;
  $('rTitle').textContent = endless ? (record ? 'Nouveau record' : 'La nuée s’est posée') : r.win ? 'Refuge atteint' : 'La nuée s’est éteinte';
  $('rStars').style.display = endless ? 'none' : '';
  const sEls = [...$('rStars').children];
  sEls.forEach((e) => e.classList.remove('on'));
  $('rUnit').textContent = endless ? 'mètres parcourus' : r.win ? `oiseaux au refuge sur ${r.total}` : 'aucun oiseau n’est arrivé';
  const stats = [['Plumes dorées', `+${r.feathers}`], ['Oiseaux perdus', r.lost]];
  if (endless) stats.push(['Record', `${save.endlessBest.toLocaleString('fr-FR')} m`]);
  else if (r.win) stats.push(['Meilleure nuée', save.best[levelId(r.ci, r.li)]]);
  $('rStats').innerHTML = stats.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');

  const nx = !endless && r.win ? after(r.ci, r.li) : null;
  const again = !r.win || endless;
  $('nextLabel').textContent = again ? 'Réessayer' : nx ? 'Vol suivant' : 'Migration sans fin';
  $('btnNext').onclick = () => { audio.tap(); if (again) play(r.mode, r.ci, r.li); else if (nx) play('level', nx.ci, nx.li); else play('endless', CHAPTERS.length - 1); };
  $('btnAgain').style.display = again ? 'none' : '';
  $('btnAgain').parentElement.style.gridTemplateColumns = again ? '1fr' : '1fr 1fr';
  $('btnToMap').textContent = endless ? 'Accueil' : 'Voyage';

  show('result');
  const big = $('rBig'), target = endless ? r.meters : r.birds, t0 = performance.now();
  (function count(now) {
    const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3);
    big.textContent = Math.round(target * e).toLocaleString('fr-FR');
    if (k < 1 && screen === 'result') requestAnimationFrame(count);
  })(t0);
  for (let i = 0; i < stars; i++) setTimeout(() => { if (screen === 'result') { sEls[i].classList.add('on'); audio.star(i); buzz(10); } }, 650 + i * 320);
}

/* ---------- écouteurs ---------- */
const tap = (id, fn) => $(id).addEventListener('click', () => { audio.unlock(); audio.tap(); fn(); });
tap('btnPlay', () => { const nx = nextLevel(); if (nx) play('level', nx.ci, nx.li); else play('endless', CHAPTERS.length - 1); });
tap('btnMap', () => { buildMap(); show('map'); });
tap('btnSkins', () => { buildSkins(); show('skins'); });
tap('btnEndless', () => {
  if (endlessOpen()) play('endless', Math.min(CHAPTERS.length - 1, Math.floor(totalStars() / 12)));
  else game.hooks.onHint('Termine le chapitre I pour ouvrir la migration sans fin.');
});
tap('btnPause', () => setPaused(true));
tap('btnResume', () => setPaused(false));
tap('btnRestart', () => { audio.suspend(false); play(current.mode, current.ci, current.li); });
tap('btnQuit', () => { audio.suspend(false); goTitle(); });
tap('btnAgain', () => play(current.mode, current.ci, current.li));
tap('btnToMap', () => { const wasEndless = current && current.mode === 'endless'; goTitle(); if (!wasEndless) { buildMap(); show('map'); } });
const toggleSound = () => { save.sound = !save.sound; audio.setOn(save.sound); persist(); refreshTitle(); };
tap('btnSound', toggleSound);
tap('btnSound2', toggleSound);
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { audio.tap(); refreshTitle(); show('title'); }));

$('chapters').addEventListener('click', (e) => {
  const b = e.target.closest('.lvl');
  if (!b || b.disabled) return;
  audio.unlock(); audio.tap();
  const [ci, li] = b.dataset.l.split('-').map(Number);
  play('level', ci, li);
});
$('skinGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.skin');
  if (!b) return;
  audio.unlock();
  const sk = SKINS.find((s) => s.id === b.dataset.s);
  if (!save.owned.includes(sk.id)) {
    if (save.feathers < sk.price) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); buzz(30); return; }
    save.feathers -= sk.price; save.owned.push(sk.id); audio.win();
  } else audio.tap();
  save.skin = sk.id; persist();
  game.start({ mode: 'attract', ci: game.ci, skin: save.skin });
  buildSkins();
});

cv.addEventListener('pointerdown', (e) => {
  audio.unlock();
  try { cv.setPointerCapture(e.pointerId); } catch { /* sans capture */ }
  game.down(e.pointerId, e.clientX, e.clientY);
});
cv.addEventListener('pointermove', (e) => game.move(e.pointerId, e.clientX, e.clientY));
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => cv.addEventListener(n, (e) => game.up(e.pointerId)));
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'game') setPaused(true); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (screen === 'game' || screen === 'pause')) setPaused(!paused); });

/* ---------- boucle ---------- */
function resize() {
  const r = stage.getBoundingClientRect();
  if (r.width && r.height) game.resize(r.width, r.height, dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  if (!paused && !window.__nuee.freeze) {
    game.update(Math.min(raw, 0.034));
    // qualité adaptative : on baisse la résolution si l'appareil peine
    if (raw > 0.027 && raw < 0.2) { if (++slow > 50 && dpr > 1) { dpr = Math.max(1, dpr - 0.5); slow = 0; resize(); } }
    else slow = Math.max(0, slow - 2);
  }
  game.render();
  requestAnimationFrame(frame);
}

window.__nuee = { game, save, play };
goTitle();
requestAnimationFrame(frame);
if (document.fonts?.ready) document.fonts.ready.then(() => stage.classList.add('fonts'));

if (!window.__NUEE_SINGLE__ && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
