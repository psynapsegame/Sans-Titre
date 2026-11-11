import { rng, lerp, clamp, smooth, TAU } from './util.js';

export const VW = 390; // largeur logique du monde, la hauteur suit l'écran

const H = (text) => ({ hint: text });

export const CHAPTERS = [
  {
    id: 'aube', num: 'I', name: 'Aube sur les marais', blurb: 'Le premier matin du voyage.',
    sky: ['#232a5c', '#7d4f86', '#ee8c6c', '#ffd7a0'],
    sun: { x: 0.7, y: 0.78, r: 44, core: '#fff3d0', glow: '#ffb169' },
    cloud: '#ffe1c2', rock: ['#2a2048', '#40305f', '#f9a983'], ink: '#191330',
    accent: '#ffd08c', storm: '#3a2e55', stars: 0, aurora: false, root: 174.6,
    speed: 82, start: 36,
    levels: [
      { name: 'Premier envol', segs: [H('Glisse ton doigt n’importe où : la nuée te suit.'), 'calm', H('Frôle les oiseaux égarés pour les rallier.'), 'calm', 'calm', H('Garde le doigt posé : la nuée se resserre.'), 'canyon:128:25:700', 'calm', 'spires:3', 'calm'] },
      { name: 'Les roselières', segs: ['calm', 'spires:4', 'canyon:110:45:800', 'calm', 'spires:5', 'canyon:106:40:600'] },
      { name: 'Le défilé', segs: ['canyon:108:50:900', 'calm', 'spires:6', 'canyon:102:55:900', 'calm'] },
      { name: 'L’ombre du faucon', segs: ['calm', H('Un faucon ! Lâche l’écran : la nuée se disperse.'), 'falcon:1', 'calm', 'spires:5', 'falcon:1', 'canyon:98:55:800', 'falcon:2', 'calm'] },
    ],
  },
  {
    id: 'gorges', num: 'II', name: 'Gorges d’ocre', blurb: 'La roche se referme sur le ciel.',
    sky: ['#1f6f9c', '#6fb7c9', '#cfe6cf', '#f7e6b4'],
    sun: { x: 0.26, y: 0.2, r: 34, core: '#fffbe6', glow: '#fff0a8' },
    cloud: '#ffffff', rock: ['#8a3f2c', '#b65a3a', '#ffd9a1'], ink: '#14202b',
    accent: '#fff2b8', storm: '#4a5a68', stars: 0, aurora: false, root: 196,
    speed: 94, start: 46,
    levels: [
      { name: 'La faille', segs: ['canyon:92:65:1000', 'calm', 'spires:7', 'canyon:88:60:700'] },
      { name: 'Aiguilles', segs: ['spires:6', 'falcon:1', 'canyon:86:70:900:f', 'spires:6', 'calm'] },
      { name: 'Le long couloir', segs: ['canyon:82:72:1300', 'falcon:2', 'spires:9', 'canyon:82:60:700:f'] },
      { name: 'Nid d’aigle', segs: ['falcon:1', 'canyon:80:75:1100:f', 'spires:8', 'falcon:2', 'canyon:76:78:1000', 'calm'] },
    ],
  },
  {
    id: 'orage', num: 'III', name: 'Front d’orage', blurb: 'Le ciel gronde, le vent se lève.',
    sky: ['#141a2b', '#2c3a50', '#5b6b78', '#a3a69a'],
    sun: { x: 0.5, y: 0.9, r: 60, core: '#e9efe6', glow: '#aeb9b0' },
    cloud: '#aab6c2', rock: ['#0e1320', '#1a2334', '#8fa3b8'], ink: '#f1f4f7',
    accent: '#d6e6ff', storm: '#0d111b', stars: 0, aurora: false, root: 146.8,
    speed: 102, start: 56,
    levels: [
      { name: 'Ciel lourd', segs: ['calm', H('La foudre frappe quand l’anneau se referme. Passe au large.'), 'storms:2', 'calm', 'storms:3', 'canyon:92:60:800', 'storms:2'] },
      { name: 'Vent de travers', segs: [H('Le vent déporte la nuée. Compense.'), 'wind:3', 'calm', 'storms:3', 'wind:5', 'canyon:90:60:800:w'] },
      { name: 'L’œil', segs: ['storms:4', 'falcon:1', 'canyon:86:70:900:w', 'storms:3', 'falcon:2', 'spires:6'] },
      { name: 'Tonnerre', segs: ['wind:5', 'storms:4', 'canyon:82:75:1100:fw', 'falcon:2', 'storms:4', 'canyon:82:60:700'] },
    ],
  },
  {
    id: 'mer', num: 'IV', name: 'Mer du soir', blurb: 'Les récifs s’embrasent au couchant.',
    sky: ['#22163f', '#7a2f6a', '#e25d63', '#ffb765'],
    sun: { x: 0.36, y: 0.84, r: 56, core: '#ffe9b0', glow: '#ff8a55' },
    cloud: '#ffb08f', rock: ['#1c1030', '#34184a', '#ff9d6e'], ink: '#140b24',
    accent: '#ffc27a', storm: '#2a1640', stars: 0.35, aurora: false, root: 164.8,
    speed: 110, start: 66,
    levels: [
      { name: 'Récifs', segs: ['spires:9', 'canyon:84:75:900', 'storms:3', 'falcon:2', 'spires:7'] },
      { name: 'Marée haute', segs: ['canyon:80:80:1200:w', 'storms:4', 'wind:6', 'falcon:2', 'canyon:78:70:800:f'] },
      { name: 'Les dents', segs: ['spires:12', 'falcon:2', 'canyon:76:80:1000:f', 'storms:4', 'spires:10', 'falcon:1'] },
      { name: 'Dernier cap', segs: ['canyon:74:82:1300:fw', 'storms:5', 'wind:7', 'falcon:3', 'canyon:74:78:1000:f', 'spires:8'] },
    ],
  },
  {
    id: 'boreale', num: 'V', name: 'Nuit boréale', blurb: 'Au bout du monde, le refuge.',
    sky: ['#040818', '#0a1c3a', '#0f3a4c', '#1b5a55'],
    sun: { x: 0.74, y: 0.16, r: 22, core: '#f4fbff', glow: '#9fd8ff' },
    cloud: '#5fa8b8', rock: ['#02040d', '#081326', '#7ff0d0'], ink: '#dffff4',
    accent: '#8ff5d2', storm: '#050912', stars: 1, aurora: true, root: 130.8,
    speed: 118, start: 76,
    levels: [
      { name: 'Sous l’aurore', segs: ['storms:3', 'spires:10', 'canyon:76:80:1000:f', 'falcon:2', 'wind:6'] },
      { name: 'Glace noire', segs: ['canyon:72:84:1400:w', 'falcon:2', 'storms:5', 'spires:12', 'canyon:72:75:800:f'] },
      { name: 'Le grand passage', segs: ['falcon:2', 'canyon:70:85:1500:fw', 'storms:5', 'wind:8', 'falcon:3', 'canyon:70:80:900:f'] },
      { name: 'Le refuge', segs: ['spires:12', 'canyon:68:86:1500:fw', 'storms:6', 'falcon:3', 'wind:8', 'canyon:68:84:1200:f', 'calm'] },
    ],
  },
];

export const SKINS = [
  { id: 'etourneau', name: 'Étourneaux', price: 0, desc: 'L’encre du voyage.', colors: null, glow: null },
  { id: 'luciole', name: 'Lucioles', price: 60, desc: 'Une nuée de braises froides.', colors: ['#f4ff9a', '#d9ff6a'], glow: '#c8ff5a' },
  { id: 'grue', name: 'Grues de papier', price: 150, desc: 'Mille plis, mille vœux.', colors: ['#ffffff', '#f3ecff', '#ffe9e4'], glow: null },
  { id: 'flamant', name: 'Flamants', price: 300, desc: 'Le rose des lagunes.', colors: ['#ff8fa8', '#ff6f91', '#ffb3a1'], glow: null },
  { id: 'braise', name: 'Braises', price: 500, desc: 'Ce qui reste du couchant.', colors: ['#ffd27a', '#ff8a3c', '#ff5a36'], glow: '#ff6a2a' },
  { id: 'aurore', name: 'Aurore', price: 800, desc: 'La lumière du bout du monde.', colors: ['#7ff0d0', '#8fb8ff', '#c79bff', '#ff9fd6'], glow: '#8fd8ff' },
];

export const levelId = (ci, li) => `${ci}-${li}`;

/**
 * Générateur de parcours. Les distances « d » croissent vers l'avant du voyage ;
 * une entité en d apparaît en haut de l'écran quand la caméra atteint d.
 */
export function makeGen(seed) {
  const r = rng(seed);
  const ents = [];
  const G = { ents, d: 300, total: 0, r };
  const rr = (a, b) => a + (b - a) * r();

  const stray = (d, x, n) => { ents.push({ t: 'stray', d, x, n, seed: r() * 100 }); G.total += n; };
  const feather = (d, x) => ents.push({ t: 'feather', d, x: clamp(x, 26, VW - 26), seed: r() * TAU });
  const featherLine = (d0, x0, d1, x1, k) => {
    const bend = rr(-40, 40);
    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0.5 : i / (k - 1);
      feather(lerp(d0, d1, t), lerp(x0, x1, t) + Math.sin(t * Math.PI) * bend);
    }
  };

  const seg = {
    calm() {
      const x = rr(70, VW - 70);
      featherLine(G.d + 20, rr(60, VW - 60), G.d + 190, x, 4);
      stray(G.d + 240, x, 6 + Math.floor(r() * 6));
      G.d += 330;
    },
    canyon(hw = 100, amp = 50, len = 800, flags = '') {
      const step = 12, n = Math.ceil(len / step) + 1;
      const L = new Float32Array(n), R = new Float32Array(n), C = new Float32Array(n);
      const jl = new Float32Array(n), jr = new Float32Array(n);
      const phase = r() * TAU, wl = rr(580, 760);
      let j1 = 0, j2 = 0;
      for (let i = 0; i < n; i++) {
        const dd = i * step;
        const env = smooth(clamp(dd / 220, 0, 1)) * smooth(clamp((len - dd) / 220, 0, 1));
        let c = VW / 2 + env * (amp * Math.sin(phase + (dd * TAU) / wl) + amp * 0.16 * Math.sin(phase * 2.3 + (dd * TAU) / (wl * 0.5)));
        c = clamp(c, hw + 12, VW - hw - 12);
        const open = 1 - smooth(clamp(dd / 170, 0, 1)) * smooth(clamp((len - dd) / 170, 0, 1));
        const h = hw + open * open * 280;
        C[i] = c; L[i] = c - h; R[i] = c + h;
        j1 = j1 * 0.6 + (r() - 0.5) * 7; j2 = j2 * 0.6 + (r() - 0.5) * 7;
        jl[i] = j1; jr[i] = j2;
      }
      const d0 = G.d;
      ents.push({ t: 'canyon', d: d0, d0, len, step, n, L, R, jl, jr });
      const at = (dd) => C[clamp(Math.round(dd / step), 0, n - 1)];
      for (let dd = 190; dd < len - 170; dd += 105) feather(d0 + dd, at(dd) + rr(-hw * 0.45, hw * 0.45));
      if (len >= 760) stray(d0 + len * 0.5, at(len * 0.5), 5 + Math.floor(r() * 5));
      if (flags.includes('f')) ents.push({ t: 'falcon', d: d0 + len * rr(0.45, 0.7) });
      if (flags.includes('w')) ents.push({ t: 'wind', d: d0 + 180, d0: d0 + 180, len: len - 360, f: (r() < 0.5 ? -1 : 1) * rr(90, 125) });
      G.d += len + 170;
    },
    spires(n = 5) {
      const d0 = G.d + 40;
      const list = [];
      for (let i = 0; i < n; i++) {
        let x = rr(46, VW - 46);
        if (i && Math.abs(x - list[i - 1].x) < 70) x = (x + VW / 2) % VW; // évite un mur continu
        x = clamp(x, 40, VW - 40);
        const sp = { t: 'spire', d: d0 + i * 96 + rr(-18, 18), x, r: rr(20, 35), seed: Math.floor(r() * 1e6) };
        list.push(sp); ents.push(sp);
        if (r() < 0.6) feather(sp.d + rr(-10, 10), x + (x > VW / 2 ? -1 : 1) * (sp.r + 24));
      }
      const mid = list[Math.floor(n / 2)];
      stray(mid.d + 48, mid.x > VW / 2 ? rr(60, 150) : rr(240, 330), 6 + Math.floor(r() * 6));
      G.d += n * 96 + 170;
    },
    storms(n = 3) {
      const d0 = G.d + 90;
      for (let i = 0; i < n; i++) {
        const x = rr(80, VW - 80), rad = rr(52, 68);
        const d = d0 + i * 215;
        ents.push({ t: 'storm', d, x, r: rad, vx: (r() < 0.5 ? -1 : 1) * rr(8, 22), period: rr(2.1, 2.9), phase: r() * 2, seed: Math.floor(r() * 1e6) });
        const side = x > VW / 2 ? -1 : 1;
        featherLine(d - 50, x + side * (rad + 26), d + 50, x + side * (rad + 40), 3);
        if (i % 2 === 1 || n === 1) stray(d + 108, clamp(x + side * 130, 50, VW - 50), 6 + Math.floor(r() * 5));
      }
      G.d += n * 215 + 150;
    },
    falcon(n = 1) {
      for (let i = 0; i < n; i++) ents.push({ t: 'falcon', d: G.d + 60 + i * 250 });
      stray(G.d + n * 250, rr(70, VW - 70), 7 + Math.floor(r() * 5));
      featherLine(G.d + 80, rr(60, VW - 60), G.d + n * 250 - 40, rr(60, VW - 60), 2 + n);
      G.d += n * 250 + 130;
    },
    wind(n = 4) {
      const len = n * 96 + 260;
      ents.push({ t: 'wind', d: G.d, d0: G.d, len, f: (r() < 0.5 ? -1 : 1) * rr(95, 130) });
      G.d += 60;
      seg.spires(n);
    },
  };

  G.add = (tok) => {
    if (typeof tok === 'object') { ents.push({ t: 'hint', d: G.d - 250, text: tok.hint }); return; }
    const [name, ...args] = tok.split(':');
    seg[name](...args.map((a) => (isNaN(+a) ? a : +a)));
  };
  G.sort = () => ents.sort((a, b) => a.d - b.d);

  /** Mode sans fin : ajoute un segment tiré au sort selon la difficulté 0..1. */
  G.addRandom = (k) => {
    const hw = Math.round(lerp(108, 70, k)), amp = Math.round(lerp(40, 84, k));
    const pool = ['calm', `spires:${4 + Math.round(k * 7)}`, `canyon:${hw}:${amp}:${Math.round(rr(700, 1200))}`];
    if (k > 0.12) pool.push(`falcon:${1 + Math.round(k * 2)}`, `canyon:${hw}:${amp}:900:f`);
    if (k > 0.3) pool.push(`storms:${2 + Math.round(k * 3)}`, `storms:${2 + Math.round(k * 3)}`);
    if (k > 0.5) pool.push(`wind:${4 + Math.round(k * 4)}`, `canyon:${hw}:${amp}:1000:fw`);
    G.add(pool[Math.floor(r() * pool.length)]);
    G.sort();
  };
  return G;
}

export function buildLevel(ci, li) {
  const ch = CHAPTERS[ci], lv = ch.levels[li];
  const G = makeGen(1000 + ci * 97 + li * 13);
  lv.segs.forEach(G.add);
  G.sort();
  return { ents: G.ents, endD: G.d + 120, total: ch.start + G.total, start: ch.start, speed: ch.speed + li * 2 };
}
