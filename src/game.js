import { TAU, clamp, lerp, rng, rgba, mix } from './util.js';
import { VW, CHAPTERS, SKINS, buildLevel, makeGen } from './levels.js';
import { Flock, clampTarget } from './flock.js';
import { audio, buzz } from './audio.js';
import { SPR, tinted, BIRD_FRAMES, FALCON_FRAMES } from './sprites.js';

const GOLD = '#ffe9ad', DANGER = '#ff4d3d';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
function glowSprite(color, size = 64) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, rgba(color, 0.9)); gr.addColorStop(0.35, rgba(color, 0.32)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
const rgbHex = (css) => '#' + css.match(/\d+/g).map((n) => (+n).toString(16).padStart(2, '0')).join('');

export class Game {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks;
    this.VH = 844; this.s = 1; this.cssScale = 1;
    this.flock = new Flock();
    this.glows = {};
    this.ch = CHAPTERS[0];
    this.holding = false; this.pid = null;
    this._env = this.env.bind(this);
    this._onDeath = this.onDeath.bind(this);
    this.clouds = []; this.motes = []; // la partie démarre une fois les sprites chargés (voir main.js)
  }

  resize(cssW, cssH, dpr) {
    this.cv.width = Math.round(cssW * dpr); this.cv.height = Math.round(cssH * dpr);
    this.s = this.cv.width / VW; this.VH = this.cv.height / this.s; this.cssScale = cssW / VW;
    this.buildSky();
    clampTarget(this.flock, this.VH);
  }

  glow(color) { return this.glows[color] || (this.glows[color] = glowSprite(color)); }

  buildSky() {
    const { cv, ch, s } = this, W = cv.width, Hh = cv.height;
    const sky = (this.sky = makeCanvas(W, Hh)), g = sky.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, Hh);
    ch.sky.forEach((c, i) => gr.addColorStop(i / (ch.sky.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    if (ch.stars) {
      const r = rng(7);
      for (let i = 0; i < 150; i++) {
        const y = Math.pow(r(), 1.6) * Hh * 0.85;
        g.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.7) * ch.stars})`;
        const sz = (0.5 + r() * 1.1) * s;
        g.fillRect(r() * W, y, sz, sz);
      }
    }
    const sx = ch.sun.x * W, sy = ch.sun.y * Hh, sr = ch.sun.r * s;
    let rg = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 7);
    rg.addColorStop(0, rgba(ch.sun.glow, 0.6)); rg.addColorStop(0.3, rgba(ch.sun.glow, 0.22)); rg.addColorStop(1, rgba(ch.sun.glow, 0));
    g.fillStyle = rg; g.fillRect(0, 0, W, Hh);
    rg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    rg.addColorStop(0, ch.sun.core); rg.addColorStop(0.82, rgba(ch.sun.core, 0.95)); rg.addColorStop(1, rgba(ch.sun.core, 0));
    g.fillStyle = rg; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
    // léger grain : évite les bandes dans les dégradés sur écrans 8 bits
    const img = g.getImageData(0, 0, W, Hh), px = img.data;
    for (let i = 0; i < px.length; i += 4) { const n = (Math.random() - 0.5) * 5; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
    g.putImageData(img, 0, 0);

  }

  start({ mode, ci = 0, li = 0, skin = 'etourneau' }) {
    const ch = (this.ch = CHAPTERS[ci]);
    this.mode = mode; this.ci = ci; this.li = li;
    this.dist = 0; this.t = 0; this.state = 'play'; this.stateT = 0;
    this.parts = []; this.strays = []; this.feathersA = []; this.canyons = []; this.spires = [];
    this.storms = []; this.winds = []; this.falcons = []; this.pending = [];
    this.next = 0; this.got = 0; this.lost = 0; this.causes = [0, 0, 0, 0]; this.flash = 0; this.hurt = 0; this.shake = 0;
    this.holding = false; this.pid = null; this.idle = 9; this.hud = {};
    let startN;
    if (mode === 'level') {
      const lv = buildLevel(ci, li);
      this.ents = lv.ents; this.endD = lv.endD; this.total = lv.total; this.speed = lv.speed; startN = lv.start;
      this.gen = null;
    } else if (mode === 'endless') {
      this.gen = makeGen((Date.now() & 0xfffff) + 1);
      for (let i = 0; i < 3; i++) this.gen.addRandom(0);
      this.ents = this.gen.ents; this.endD = Infinity; this.total = 0; this.speed = 92; startN = 32;
    } else {
      this.ents = []; this.endD = Infinity; this.total = 0; this.speed = 34; startN = 130; this.gen = null;
    }
    const sk = SKINS.find((k) => k.id === skin) || SKINS[0];
    this.colors = sk.colors || [ch.ink];
    const gc = sk.glow || (ch.aurora ? ch.accent : null);
    this.birdGlow = gc ? this.glow(gc) : null;

    const f = this.flock;
    f.n = 0; f.hold = 0; f.tx = VW / 2; f.ty = this.VH * (mode === 'attract' ? 0.47 : 0.64);
    for (let i = 0; i < startN; i++) {
      const a = Math.random() * TAU, rad = Math.sqrt(Math.random()) * 46;
      f.add(f.tx + Math.cos(a) * rad, f.ty + Math.sin(a) * rad, Math.cos(a + 1.6) * 60, Math.sin(a + 1.6) * 60);
    }
    f.cx = f.tx; f.cy = f.ty; f.ptx = f.tx; f.pty = f.ty; f.tvx = 0; f.tvy = 0;

    // sprites teintés pour ce chapitre : nuages, orage, roche, végétation, oiseaux
    const lightRock = rgbHex(mix(ch.rock[1], ch.rock[2], 0.42));
    this.spr = {
      cloud: tinted('clouds', ch.cloud, 0.5, 0.5),
      stormDark: tinted('clouds', ch.storm, 0.5),
      stormLight: tinted('clouds', rgbHex(mix(ch.storm, ch.cloud, 0.45)), 0.5),
      stacks: [0, 1, 2].map((i) => tinted('stack' + i, lightRock, 1, 0.14)),
      stackShadow: [0, 1, 2].map((i) => tinted('stack' + i, '#0a0519', 0.5)),
      pines: [0, 1].map((i) => tinted('pine' + i, ch.veg[0], 1, ch.veg[1])),
      pineShadow: [SPR.pine0_shadow, SPR.pine1_shadow],
      birds: this.colors.map((c) => tinted('birds', c, 1, ch.aurora || sk.glow ? 0 : 0.07)),
    };
    const rk = makeCanvas(192, 192), rg2 = rk.getContext('2d');
    rg2.fillStyle = ch.rock[0]; rg2.fillRect(0, 0, 192, 192);
    rg2.globalAlpha = 0.34; rg2.globalCompositeOperation = 'overlay'; rg2.drawImage(SPR.rock, 0, 0, 192, 192);
    this.rockPat = this.ctx.createPattern(rk, 'repeat');
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const fg = i >= 7;
      this.clouds.push({ x: Math.random() * VW, y: Math.random() * this.VH, w: fg ? 520 : 200 + Math.random() * 230, par: fg ? 1.35 : 0.12 + Math.random() * 0.3, a: fg ? 0.13 : 0.22 + Math.random() * 0.3, spr: i % 4, fg });
    }
    this.motes = [];
    for (let i = 0; i < 34; i++) this.motes.push({ x: Math.random() * VW, y: Math.random() * this.VH, z: 0.5 + Math.random() * 0.8, p: Math.random() * TAU });
    if (ch.aurora && !this.aur) {
      this.aur = ['#5ff0b0', '#a877ff'].map((c) => {
        const cv = makeCanvas(2, 64), g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(0.7, rgba(c, 0.5)); gr.addColorStop(1, rgba(c, 0));
        g.fillStyle = gr; g.fillRect(0, 0, 2, 64);
        return cv;
      });
    }
    this.buildSky();
    audio.setScene(ch.root, mode !== 'attract');
  }

  /* ---------- entrées tactiles ---------- */
  down(id, x, y) {
    if (this.pid !== null) return;
    this.pid = id; this.holding = true; this.lx = x; this.ly = y; this.idle = 0;
  }
  move(id, x, y) {
    if (id !== this.pid) return;
    const k = 1.3 / this.cssScale;
    if (this.state === 'play') {
      this.flock.tx += (x - this.lx) * k; this.flock.ty += (y - this.ly) * k;
      clampTarget(this.flock, this.VH);
    }
    this.lx = x; this.ly = y; this.idle = 0;
  }
  up(id) { if (id === this.pid) { this.pid = null; this.holding = false; } }

  /* ---------- forces d'environnement appliquées à chaque oiseau ---------- */
  env(i, x, y, out) {
    const dist = this.dist, wd = dist - y;
    const mortal = this.state === 'play' && this.mode !== 'attract';
    for (const c of this.canyons) {
      const u = (wd - c.d0) / c.step;
      if (u < 0 || u >= c.n - 1) continue;
      const k = u | 0, fr = u - k;
      const L = c.L[k] + (c.L[k + 1] - c.L[k]) * fr, R = c.R[k] + (c.R[k + 1] - c.R[k]) * fr;
      if (x < L + 1 || x > R - 1) { if (mortal) { out.dead = 1; return; } }
      const dl = x - L, dr = R - x;
      if (dl < 26) out.ax += (1 - dl / 26) * 950;
      if (dr < 26) out.ax -= (1 - dr / 26) * 950;
    }
    for (const sp of this.spires) {
      const dx = x - sp.x, lim = sp.r + 30;
      if (dx > lim || dx < -lim) continue;
      const dy = y - (dist - sp.d), d2 = dx * dx + dy * dy;
      if (d2 > lim * lim) continue;
      if (d2 < (sp.r - 3) * (sp.r - 3)) { if (mortal) { out.dead = 1; return; } }
      const d = Math.sqrt(d2) + 1e-3, f = ((1 - (d - sp.r) / 30) * 1150) / d;
      out.ax += dx * f; out.ay += dy * f;
    }
    for (const w of this.winds) {
      const u = wd - w.d0;
      if (u < 0 || u > w.len) continue;
      out.ax += w.f * 2.6 * Math.min(1, u / 90, (w.len - u) / 90);
    }
    for (const fa of this.falcons) {
      if (fa.st !== 'dive') continue;
      const dx = x - fa.x, dy = y - fa.y, d2 = dx * dx + dy * dy;
      if (d2 > 10000) continue;
      if (d2 < 72 && mortal) { out.dead = 2; fa.kills++; return; }
      const d = Math.sqrt(d2) + 1e-3, f = ((1 - d / 100) * 2600) / d;
      out.ax += dx * f; out.ay += dy * f;
    }
  }

  onDeath(x, y, vx, vy, cause) {
    this.lost++; this.causes[cause]++;
    for (let k = 0; k < 2; k++) this.spawn({ k: 'feather', x, y, vx: vx * 0.25 + (Math.random() - 0.5) * 60, vy: vy * 0.25 + (Math.random() - 0.5) * 60, life: 0.9 + Math.random() * 0.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9, color: this.colors[0] });
    this.hurt = Math.min(1, this.hurt + 0.22);
    audio.die();
  }

  spawn(p) { if (this.parts.length < 420) { p.max = p.life; this.parts.push(p); } }

  /* ---------- simulation ---------- */
  update(dt) {
    const f = this.flock, VH = this.VH;
    this.t += dt; this.stateT += dt;
    const playing = this.state === 'play';
    if (this.mode === 'endless') this.speed = 92 + Math.min(52, this.dist / 330);
    const scroll = playing ? this.speed : this.state === 'arrive' ? this.speed * Math.max(0, 1 - this.stateT * 1.5) : this.speed * 0.4;
    this.dist += scroll * dt;
    const dist = this.dist;

    // cible et resserrement
    let holdT = this.holding ? 1 : 0;
    if (this.mode === 'attract') {
      this.idle += dt;
      if (this.idle > 2.5) {
        const a = this.t * 0.42;
        f.tx += (VW / 2 + Math.sin(a) * 105 - f.tx) * dt * 1.5;
        f.ty += (VH * 0.47 + Math.sin(a * 2.03 + 0.6) * VH * 0.13 - f.ty) * dt * 1.5;
        holdT = 0.34 + 0.3 * Math.sin(this.t * 0.33);
      }
    } else if (this.state === 'arrive') {
      holdT = 1; f.tx += (VW / 2 - f.tx) * dt * 3; f.ty += (dist - this.endD - f.ty) * dt * 3;
    } else if (this.state === 'lost') holdT = 0;
    f.hold += (holdT - f.hold) * Math.min(1, dt * 7);

    // activation des entités à l'approche
    const ents = this.ents;
    while (this.next < ents.length && ents[this.next].d - dist < 130) {
      const e = ents[this.next++];
      if (e.t === 'stray') this.strays.push(e);
      else if (e.t === 'feather') this.feathersA.push(e);
      else if (e.t === 'canyon') this.canyons.push(e);
      else if (e.t === 'wind') this.winds.push(e);
      else if (e.t === 'spire') {
        const r = rng(e.seed); e.v = [];
        for (let k = 0; k < 11; k++) e.v.push(0.84 + r() * 0.3);
        this.spires.push(e);
      } else if (e.t === 'storm') {
        const r = rng(e.seed); e.tt = e.phase; e.fl = 0; e.bolts = []; e.puffs = [];
        for (let k = 0; k < 11; k++) { const a = r() * TAU, d = Math.sqrt(r()) * e.r * 0.62; e.puffs.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, e.r * (0.42 + r() * 0.26)]); }
        this.storms.push(e);
      } else this.pending.push(e);
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      if (e.d > dist) continue;
      this.pending.splice(i, 1);
      if (e.t === 'hint') this.hooks.onHint(e.text);
      else if (e.t === 'falcon' && playing) this.spawnFalcon();
    }
    if (this.gen && this.gen.d < dist + 1600) this.gen.addRandom(clamp(dist / 15000, 0, 1));

    const off = (e) => dist - e.d > VH + 150;
    if (this.strays.length && off(this.strays[0])) this.strays.shift();
    if (this.feathersA.length && off(this.feathersA[0])) this.feathersA.shift();
    if (this.spires.length && off(this.spires[0])) this.spires.shift();
    if (this.storms.length && off(this.storms[0])) this.storms.shift();
    if (this.canyons.length && dist - this.canyons[0].d0 - this.canyons[0].len > VH + 60) this.canyons.shift();
    if (this.winds.length && dist - this.winds[0].d0 - this.winds[0].len > VH + 60) this.winds.shift();

    f.update(dt, this.t, VH, this._env, this._onDeath);

    this.updateStorms(dt, playing);
    this.updateFalcons(dt);
    if (this.mode !== 'attract') this.collect();

    // vent visible
    for (const w of this.winds) {
      const y0 = dist - w.d0 - w.len, y1 = dist - w.d0;
      const a = Math.max(0, y0), b = Math.min(VH, y1);
      if (b > a && Math.random() < 0.7) this.spawn({ k: 'streak', x: Math.random() * VW, y: a + Math.random() * (b - a), vx: Math.sign(w.f) * (240 + Math.random() * 140), vy: 0, life: 0.5 + Math.random() * 0.4 });
    }

    // particules
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'feather') { p.vx *= 1 - dt * 2; p.vy += (scroll * 0.7 - p.vy) * dt * 2; p.rot += p.vr * dt; }
      else if (p.k === 'spark') { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; }
    }
    for (const c of this.clouds) {
      c.y += (scroll * c.par + 4) * dt;
      if (c.y > VH + c.w * 0.3) { c.y = -c.w * 0.4; c.x = Math.random() * VW; }
    }
    for (const m of this.motes) {
      m.y += (scroll * m.z + 6) * dt; m.x += Math.sin(this.t * 0.7 + m.p) * 5 * dt;
      if (m.y > VH + 4) { m.y = -4; m.x = Math.random() * VW; }
    }
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.hurt = Math.max(0, this.hurt - dt * 1.3);
    this.shake = Math.max(0, this.shake - dt * 3);

    audio.wind(f.speed, f.hold);
    audio.tick(dt);

    // états de fin
    if (this.mode !== 'attract') {
      if (playing && dist >= this.endD + VH * 0.42) {
        this.state = 'arrive'; this.stateT = 0; this.hooks.onHint('');
        audio.win();
      } else if (this.state === 'arrive' && this.stateT > 2.7) this.finish(true);
      if ((playing || this.state === 'arrive') && f.n === 0) { this.state = 'lost'; this.stateT = 0; audio.lose(); buzz(120); }
      else if (this.state === 'lost' && this.stateT > 1.5) this.finish(false);

      const h = this.hud, prog = this.endD === Infinity ? -1 : clamp(dist / (this.endD + VH * 0.42), 0, 1);
      const m = Math.floor(dist / 10);
      if (h.n !== f.n || h.got !== this.got || Math.abs((h.prog || 0) - prog) > 0.003 || h.m !== m) {
        h.n = f.n; h.got = this.got; h.prog = prog; h.m = m;
        this.hooks.onHud(f.n, this.got, prog, m);
      }
    }
  }

  finish(win) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.hooks.onEnd({ win, birds: this.flock.n, feathers: this.got, total: this.total, meters: Math.floor(this.dist / 10), lost: this.lost, causes: this.causes, mode: this.mode, ci: this.ci, li: this.li });
  }

  collect() {
    const f = this.flock, dist = this.dist;
    if (!f.n) return;
    for (const s of this.strays) {
      if (s.taken) continue;
      const sy = dist - s.d;
      if (Math.abs(sy - f.cy) > 260) continue;
      let hit = false;
      for (let i = 0; i < f.n; i++) { const dx = f.x[i] - s.x, dy = f.y[i] - sy; if (dx * dx + dy * dy < 1150) { hit = true; break; } }
      if (!hit) continue;
      s.taken = true;
      for (let k = 0; k < s.n; k++) { const a = (k / s.n) * TAU; f.add(s.x + Math.cos(a) * 10, sy + Math.sin(a) * 10, Math.cos(a) * 80, Math.sin(a) * 80); }
      this.spawn({ k: 'ring', x: s.x, y: sy, vx: 0, vy: this.speed, life: 0.7, color: this.ch.accent });
      this.spawn({ k: 'text', x: s.x, y: sy - 16, vx: 0, vy: -26, life: 1.2, text: `+${s.n}` });
      for (let k = 0; k < 10; k++) { const a = Math.random() * TAU; this.spawn({ k: 'spark', x: s.x, y: sy, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, life: 0.6, color: this.ch.accent }); }
      audio.collect(); buzz(14);
    }
    for (const fe of this.feathersA) {
      if (fe.taken) continue;
      const fy = dist - fe.d;
      if (Math.abs(fy - f.cy) > 240) continue;
      for (let i = 0; i < f.n; i++) {
        const dx = f.x[i] - fe.x, dy = f.y[i] - fy;
        if (dx * dx + dy * dy < 200) {
          fe.taken = true; this.got++;
          for (let k = 0; k < 5; k++) { const a = Math.random() * TAU; this.spawn({ k: 'spark', x: fe.x, y: fy, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.45, color: GOLD }); }
          audio.feather();
          break;
        }
      }
    }
  }

  updateStorms(dt, playing) {
    const f = this.flock, dist = this.dist;
    for (const st of this.storms) {
      const P = st.period, before = st.tt % P;
      st.tt += dt; st.fl = Math.max(0, st.fl - dt);
      st.x += st.vx * dt;
      if (st.x < 60 || st.x > VW - 60) { st.vx *= -1; st.x = clamp(st.x, 60, VW - 60); }
      const now = st.tt % P, sy = dist - st.d;
      const visible = sy > -st.r && sy < this.VH + st.r * 0.5;
      if (!visible || !playing) continue;
      if (before < P - 0.8 && now >= P - 0.8) audio.charge();
      if (now < before) {
        const r2 = st.r * st.r * 0.9;
        let killed = 0;
        for (let i = f.n - 1; i >= 0; i--) {
          const dx = f.x[i] - st.x, dy = f.y[i] - sy;
          if (dx * dx + dy * dy < r2) { this.onDeath(f.x[i], f.y[i], f.vx[i], f.vy[i], 3); f.kill(i); killed++; }
        }
        st.fl = 0.24; st.bolts = [];
        for (let b = 0; b < 3; b++) {
          const pts = []; let a = Math.random() * TAU, x = 0, y = 0;
          for (let k = 0; k < 7; k++) { pts.push(x, y); a += (Math.random() - 0.5) * 1.6; const l = st.r * 0.17; x += Math.cos(a) * l; y += Math.sin(a) * l; }
          st.bolts.push(pts);
        }
        this.flash = 0.35; this.shake = 0.6; audio.thunder(); buzz(killed ? 60 : 20);
      }
    }
  }

  spawnFalcon() {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.falcons.push({ st: 'warn', t: 0, side, ox: side < 0 ? -26 : VW + 26, oy: lerp(this.VH * 0.08, this.VH * 0.38, Math.random()), ax: this.flock.cx, ay: this.flock.cy, x: 0, y: 0, vx: 0, vy: 0, kills: 0 });
    audio.screech(); buzz([20, 40, 20]);
  }

  updateFalcons(dt) {
    const f = this.flock;
    for (let i = this.falcons.length - 1; i >= 0; i--) {
      const fa = this.falcons[i];
      fa.t += dt;
      if (fa.st === 'warn') {
        if (fa.t < 1.05) { fa.ax += (f.cx - fa.ax) * Math.min(1, dt * 8); fa.ay += (f.cy - fa.ay) * Math.min(1, dt * 8); }
        if (fa.t >= 1.45) {
          const dx = fa.ax - fa.ox, dy = fa.ay - fa.oy, d = Math.hypot(dx, dy) + 1e-3;
          fa.st = 'dive'; fa.x = fa.ox; fa.y = fa.oy; fa.vx = (dx / d) * 880; fa.vy = (dy / d) * 880;
          audio.dive();
        }
      } else {
        fa.x += fa.vx * dt; fa.y += fa.vy * dt;
        this.spawn({ k: 'spark', x: fa.x, y: fa.y, vx: -fa.vx * 0.05, vy: -fa.vy * 0.05, life: 0.35, color: DANGER });
        if (fa.x < -90 || fa.x > VW + 90 || fa.y > this.VH + 90 || fa.y < -90) {
          if (fa.kills) { this.shake = 0.4; buzz(40); }
          this.falcons.splice(i, 1);
        }
      }
    }
  }

  /* ---------- rendu ---------- */
  render() {
    const g = this.ctx, s = this.s, VH = this.VH, t = this.t, ch = this.ch, dist = this.dist, f = this.flock;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(this.sky, 0, 0);
    const sh = this.shake > 0 ? this.shake * 5 : 0;
    this.ox = (Math.random() - 0.5) * sh * s; this.oy = (Math.random() - 0.5) * sh * s;
    g.setTransform(s, 0, 0, s, this.ox, this.oy);

    if (ch.aurora) this.drawAurora(g, t);
    for (const c of this.clouds) if (!c.fg) { g.globalAlpha = c.a; g.drawImage(this.spr.cloud, (c.spr % 2) * 256, (c.spr >> 1) * 256, 256, 256, c.x - c.w / 2, c.y - c.w / 2, c.w, c.w); }
    g.globalAlpha = 1;
    g.fillStyle = rgba(ch.accent, 0.55);
    for (const m of this.motes) { const z = m.z * 1.3; g.globalAlpha = 0.25 + 0.3 * Math.sin(t * 2 + m.p) ** 2; g.fillRect(m.x, m.y, z, z); }
    g.globalAlpha = 1;

    for (const c of this.canyons) this.drawCanyon(g, c);
    for (const sp of this.spires) this.drawSpire(g, sp);
    if (this.endD !== Infinity) this.drawRoost(g);

    // plumes dorées
    const gg = this.glow(GOLD);
    for (const fe of this.feathersA) {
      if (fe.taken) continue;
      const y = dist - fe.d;
      if (y < -20 || y > VH + 20) continue;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55;
      g.drawImage(gg, fe.x - 14, y - 14, 28, 28);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.save(); g.translate(fe.x, y + Math.sin(t * 2.4 + fe.seed) * 2.5); g.rotate(0.5 + Math.sin(t * 1.7 + fe.seed) * 0.35);
      g.scale(0.55 + 0.45 * Math.abs(Math.cos(t * 2 + fe.seed)), 1);
      g.drawImage(SPR.feather, -11, -11, 22, 22);
      g.restore();
    }

    // oiseaux égarés
    const ga = this.glow(ch.accent);
    for (const st of this.strays) {
      if (st.taken) continue;
      const y = dist - st.d;
      if (y < -40 || y > VH + 40) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + st.seed);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + pulse * 0.25;
      g.drawImage(ga, st.x - 42, y - 42, 84, 84);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.5 - pulse * 0.25; g.strokeStyle = ch.accent; g.lineWidth = 1.2;
      g.beginPath(); g.arc(st.x, y, 21 + pulse * 5, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      for (let k = 0; k < st.n; k++) {
        const a = t * 1.9 + st.seed + (k / st.n) * TAU, rad = 11 + 3 * Math.sin(t * 2 + k);
        this.bird(g, this.spr.birds[0], st.x + Math.cos(a) * rad, y + Math.sin(a) * rad, -Math.sin(a), Math.cos(a), 7.5, (t * 20 + k * 3) | 0);
      }
      g.setTransform(s, 0, 0, s, this.ox, this.oy);
    }

    // la nuée
    if (this.birdGlow) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
      const stepG = f.n > 160 ? 2 : 1, gz = stepG === 2 ? 24 : 18;
      for (let i = 0; i < f.n; i += stepG) g.drawImage(this.birdGlow, f.x[i] - gz / 2, f.y[i] - gz / 2, gz, gz);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    {
      const sheets = this.spr.birds, nc = sheets.length, half = 8 * (0.72 + 0.28 * f.dense) * (this.mode === 'attract' ? 0.9 : 1);
      for (let i = 0; i < f.n; i++) {
        const sp = Math.hypot(f.vx[i], f.vy[i]) + 1e-3;
        this.bird(g, sheets[i % nc], f.x[i], f.y[i], f.vx[i] / sp, f.vy[i] / sp, half, (t * 21 + f.ph[i] * 16) | 0);
      }
      g.setTransform(s, 0, 0, s, this.ox, this.oy);
    }

    for (const fa of this.falcons) this.drawFalcon(g, fa);
    for (const st of this.storms) this.drawStorm(g, st);
    this.drawParts(g);

    for (const c of this.clouds) if (c.fg) { g.globalAlpha = c.a; g.drawImage(this.spr.cloud, (c.spr % 2) * 256, (c.spr >> 1) * 256, 256, 256, c.x - c.w / 2, c.y - c.w / 2, c.w, c.w); }
    g.globalAlpha = 1;

    // repère de la cible
    if (this.mode !== 'attract' && this.state === 'play') {
      const h = f.hold, rad = lerp(30, 9, h);
      g.strokeStyle = `rgba(255,255,255,${lerp(0.28, 0.75, h)})`; g.lineWidth = 1.3;
      g.setLineDash(h < 0.5 ? [3, 5] : []);
      g.beginPath(); g.arc(f.tx, f.ty, rad, 0, TAU); g.stroke(); g.setLineDash([]);
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    // vignettage et voile rouge : calques CSS, composés par le GPU
    const hv = Math.round(Math.min(0.6, this.hurt * 0.6) * 20) / 20;
    if (hv !== this._hv) { this._hv = hv; this.hooks.onHurt(hv); }
    if (this.flash > 0.01) { g.globalAlpha = this.flash; g.fillStyle = '#fff'; g.fillRect(0, 0, this.cv.width, this.cv.height); }
    g.globalAlpha = 1;
  }

  /** Dessine un oiseau (image d'une planche d'animation) orienté selon son cap (ux, uy). */
  bird(g, sheet, x, y, ux, uy, half, frame, frames = BIRD_FRAMES) {
    const s = this.s, fw = sheet.width / frames;
    g.setTransform(-uy * s, ux * s, -ux * s, -uy * s, x * s + this.ox, y * s + this.oy);
    g.drawImage(sheet, (frame % frames) * fw, 0, fw, sheet.height, -half, -half, half * 2, half * 2);
  }

  drawAurora(g, t) {
    // dessinée en basse résolution puis étirée : rubans lisses pour un coût minime
    const W = 66, Hh = 120, VH = this.VH;
    const off = this.aurCv || (this.aurCv = makeCanvas(W, Hh)), a = off.getContext('2d');
    a.clearRect(0, 0, W, Hh); a.globalCompositeOperation = 'lighter';
    const ky = Hh / VH;
    for (let k = 0; k < 2; k++) {
      const spr = this.aur[k], base = VH * (0.3 + k * 0.2);
      for (let c = 0; c < W; c++) {
        const x = c * 6;
        const yb = base + Math.sin(x * 0.012 + t * 0.25 + k * 2) * 46 + Math.sin(x * 0.031 - t * 0.18) * 18;
        const h = 170 + Math.sin(x * 0.021 + t * 0.4 + k) * 60;
        a.globalAlpha = 0.4 + 0.3 * Math.sin(x * 0.045 + t * 0.7 + k * 3);
        a.drawImage(spr, c, (yb - h) * ky, 1, h * ky);
      }
    }
    g.globalCompositeOperation = 'lighter';
    g.drawImage(off, 0, 0, VW + 6, VH);
    g.globalCompositeOperation = 'source-over';
  }

  drawCanyon(g, c) {
    const dist = this.dist, VH = this.VH, step = c.step;
    const i0 = Math.max(0, Math.floor((dist - VH - 30 - c.d0) / step));
    const i1 = Math.min(c.n - 1, Math.ceil((dist + 30 - c.d0) / step));
    if (i1 <= i0) return;
    const rock = this.ch.rock;
    const side = (sgn, o, dy, color, jk) => {
      const edge = sgn < 0 ? -30 : VW + 30, arr = sgn < 0 ? c.L : c.R, j = sgn < 0 ? c.jl : c.jr;
      g.fillStyle = color; g.beginPath();
      g.moveTo(edge, dist - (c.d0 + i0 * step) + dy);
      for (let i = i0; i <= i1; i++) g.lineTo(arr[i] + j[i] * jk + sgn * o, dist - (c.d0 + i * step) + dy);
      g.lineTo(edge, dist - (c.d0 + i1 * step) + dy);
      g.closePath(); g.fill();
    };
    for (const sgn of [-1, 1]) {
      side(sgn, -7, 9, 'rgba(10,5,25,0.2)', 1);
      side(sgn, 0, 0, rock[1], 1);
      this.rockPat.setTransform(new DOMMatrix([1.3, 0, 0, 1.3, 0, dist % 249.6]));
      side(sgn, 12, 0, this.rockPat, 1.9);
      side(sgn, 46, 0, 'rgba(0,0,0,0.16)', 3);
      const arr = sgn < 0 ? c.L : c.R, j = sgn < 0 ? c.jl : c.jr;
      g.strokeStyle = rgba(rock[2], 0.6); g.lineWidth = 1.3; g.beginPath();
      for (let i = i0; i <= i1; i++) { const y = dist - (c.d0 + i * step); if (i === i0) g.moveTo(arr[i] + j[i], y); else g.lineTo(arr[i] + j[i], y); }
      g.stroke();
    }
    // bosquets sur les plateaux (sprites avec ombre portée)
    if (!c.trees) {
      c.trees = []; const r = rng(Math.floor(c.d0) + 5);
      for (let i = 2; i < c.n - 2; i++) for (const sgn of [-1, 1]) {
        const edge = sgn < 0 ? c.L[i] : c.R[i], room = sgn < 0 ? edge + 10 : VW + 10 - edge;
        if (room < 44 || r() > 0.62) continue;
        const x = edge + sgn * (24 + r() * (room - 34));
        c.trees.push(c.d0 + (i + r()) * step, x, 13 + r() * 9, r() < 0.5 ? 0 : 1);
      }
    }
    // image de 1,9 unité de large ; le pied du tronc est à (50 %, 62 %) ; l'ombre est cadrée un peu plus à droite
    const tr = c.trees, pines = this.spr.pines, sh = this.spr.pineShadow;
    g.globalAlpha = 0.34;
    for (let i = 0; i < tr.length; i += 4) {
      const y = dist - tr[i];
      if (y < -40 || y > VH + 40) continue;
      const k = tr[i + 2] * 2.6;
      g.drawImage(sh[tr[i + 3]], tr[i + 1] - k * 0.5 + k * 0.1316, y - k * 0.62 + k * 0.089, k, k);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < tr.length; i += 4) {
      const y = dist - tr[i];
      if (y < -40 || y > VH + 40) continue;
      const k = tr[i + 2] * 2.6;
      g.drawImage(pines[tr[i + 3]], tr[i + 1] - k * 0.5, y - k * 0.62, k, k);
    }
  }

  drawSpire(g, sp) {
    const y = this.dist - sp.d;
    if (y < -50 || y > this.VH + 50) return;
    const v = sp.seed % 3, k = sp.r * 3.7 * 0.9; // image : 3,7 rayons de large, sommet un peu en retrait de la collision
    g.globalAlpha = 0.22; g.drawImage(this.spr.stackShadow[v], sp.x - k / 2 + 7, y - k / 2 + 10, k, k);
    g.globalAlpha = 1; g.drawImage(this.spr.stacks[v], sp.x - k / 2, y - k / 2, k, k);
  }

  drawRoost(g) {
    const y = this.dist - this.endD, x = VW / 2, t = this.t, ac = this.ch.accent;
    if (y < -160) return;
    const sp = this.glow(ac);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.75; g.drawImage(sp, x - 150, y - 150, 300, 300);
    g.globalAlpha = 0.9; g.drawImage(sp, x - 60, y - 60, 120, 120);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.strokeStyle = ac; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 46 + Math.sin(t * 2) * 2, 0, TAU); g.stroke();
    g.lineWidth = 1; g.globalAlpha = 0.6; g.setLineDash([2, 9]);
    g.beginPath(); g.arc(x, y, 64, t * 0.4, t * 0.4 + TAU); g.stroke();
    g.beginPath(); g.arc(x, y, 86, -t * 0.25, -t * 0.25 + TAU); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }

  drawFalcon(g, fa) {
    if (fa.st === 'warn') {
      const k = clamp(fa.t / 1.45, 0, 1), mx = fa.side < 0 ? 18 : VW - 18, my = fa.oy;
      const blink = 0.55 + 0.45 * Math.sin(fa.t * 22);
      g.strokeStyle = DANGER; g.globalAlpha = 0.2 + k * 0.55; g.lineWidth = 1.5; g.setLineDash([6, 7]); g.lineDashOffset = -fa.t * 60;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(fa.ax, fa.ay); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(fa.ax, fa.ay, 26 - k * 14, 0, TAU); g.stroke();
      g.globalAlpha = blink; g.fillStyle = DANGER;
      g.beginPath(); g.arc(mx, my, 12, 0, TAU); g.fill();
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.beginPath();
      const d = Math.atan2(fa.ay - my, fa.ax - mx);
      this.wing(g, mx, my, Math.cos(d), Math.sin(d), 0.42);
      g.fill();
      return;
    }
    const sp = Math.hypot(fa.vx, fa.vy), ux = fa.vx / sp, uy = fa.vy / sp;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55;
    g.drawImage(this.glow(DANGER), fa.x - 46, fa.y - 46, 92, 92);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.25;
    this.bird(g, tinted('falcon', '#0a0519'), fa.x + 8, fa.y + 12, ux, uy, 36, (this.t * 12) | 0, FALCON_FRAMES);
    g.globalAlpha = 1;
    this.bird(g, SPR.falcon, fa.x, fa.y, ux, uy, 36, (this.t * 12) | 0, FALCON_FRAMES);
    g.setTransform(this.s, 0, 0, this.s, this.ox, this.oy);
  }

  /** Silhouette de rapace, ailes en flèche. */
  wing(g, x, y, ux, uy, k) {
    const px = -uy, py = ux, P = (a, b) => [x + ux * a * k + px * b * k, y + uy * a * k + py * b * k];
    const pts = [P(24, 0), P(10, 3.5), P(3, 9), P(-12, 30), P(-9, 9), P(-24, 6), P(-17, 0), P(-24, -6), P(-9, -9), P(-12, -30), P(3, -9), P(10, -3.5)];
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }

  drawStorm(g, st) {
    const y = this.dist - st.d;
    if (y < -st.r - 40 || y > this.VH + st.r + 40) return;
    const P = st.period, ph = st.tt % P, charge = clamp((ph - (P - 0.8)) / 0.8, 0, 1), x = st.x;
    const dk = this.spr.stormDark, lt = this.spr.stormLight;
    st.puffs.forEach((p, i) => { const z = p[2] * 3.6, q = i % 4; g.drawImage(dk, (q % 2) * 256, (q >> 1) * 256, 256, 256, x + p[0] - z / 2, y + p[1] - z / 2, z, z); });
    g.globalAlpha = 0.85;
    st.puffs.forEach((p, i) => { if (i % 2) return; const z = p[2] * 2.3, q = (i + 1) % 4; g.drawImage(lt, (q % 2) * 256, (q >> 1) * 256, 256, 256, x + p[0] - p[2] * 0.3 - z / 2, y + p[1] - p[2] * 0.45 - z / 2, z, z); });
    g.globalAlpha = 1;
    if (charge > 0 || st.fl > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, charge * 0.5 * (0.6 + 0.4 * Math.sin(st.tt * 40)) + st.fl * 4);
      g.drawImage(this.glow('#cfd8ff'), x - st.r, y - st.r, st.r * 2, st.r * 2);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // anneau de danger : se referme juste avant la foudre
    g.strokeStyle = charge > 0 ? '#ffffff' : 'rgba(255,255,255,0.28)'; g.lineWidth = charge > 0 ? 1.8 : 1;
    g.setLineDash([4, 6]); g.beginPath(); g.arc(x, y, st.r * 0.95, 0, TAU); g.stroke(); g.setLineDash([]);
    if (charge > 0) { g.globalAlpha = charge; g.beginPath(); g.arc(x, y, st.r * (0.95 + (1 - charge) * 0.7), 0, TAU); g.stroke(); g.globalAlpha = 1; }
    if (st.fl > 0) {
      for (const b of st.bolts) {
        for (const [lw, a] of [[5, 0.25], [1.6, 1]]) {
          g.strokeStyle = `rgba(235,240,255,${a})`; g.lineWidth = lw; g.beginPath();
          for (let i = 0; i < b.length; i += 2) { if (i) g.lineTo(x + b[i], y + b[i + 1]); else g.moveTo(x + b[i], y + b[i + 1]); }
          g.stroke();
        }
      }
    }
  }

  drawParts(g) {
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.k === 'feather') {
        g.globalAlpha = a; g.fillStyle = p.color;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.rot * 1.7)));
        g.beginPath(); g.ellipse(0, 0, 3.6, 1.3, 0, 0, TAU); g.fill(); g.restore();
      } else if (p.k === 'spark') {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
        const z = 5 + a * 7; g.drawImage(this.glow(p.color), p.x - z / 2, p.y - z / 2, z, z);
        g.globalCompositeOperation = 'source-over';
      } else if (p.k === 'ring') {
        g.globalAlpha = a; g.strokeStyle = p.color; g.lineWidth = 2 * a + 0.3;
        g.beginPath(); g.arc(p.x, p.y, 22 + (1 - a) * 46, 0, TAU); g.stroke();
      } else if (p.k === 'streak') {
        g.globalAlpha = Math.sin(a * Math.PI) * 0.38; g.strokeStyle = '#fff'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - Math.sign(p.vx) * 34, p.y); g.stroke();
      } else if (p.k === 'text') {
        g.globalAlpha = Math.min(1, a * 2); g.fillStyle = '#fff'; g.textAlign = 'center';
        g.font = '600 15px Outfit, system-ui, sans-serif'; g.fillText(p.text, p.x, p.y);
      }
    }
    g.globalAlpha = 1;
  }
}
