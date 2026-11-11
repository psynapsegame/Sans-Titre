import { TAU, clamp, lerp, rng } from './util.js';
import { VW, CHAPTERS, buildLevel, makeGen } from './levels.js';
import { Flock, clampTarget } from './flock.js';
import { audio, buzz } from './audio.js';

/** Distance d'anticipation : les entités sont créées dès qu'elles entrent dans le champ de la caméra 3D. */
export const LOOK = 2700;

/**
 * Simulation d'un vol (aucun rendu ici : voir render3d.js).
 * Repère logique : x ∈ [0, VW] en travers, y ∈ [0, VH] en profondeur (0 = loin devant, VH = près de la caméra).
 * Une entité à la distance d se trouve en y = dist − d.
 */
export class Game {
  constructor(hooks) {
    this.hooks = hooks;
    this.VH = 720;
    this.kx = 1; this.ky = 1; // unités logiques par pixel CSS, fournies par le moteur de rendu
    this.flock = new Flock();
    this.ch = CHAPTERS[0];
    this.holding = false; this.pid = null;
    this.epoch = 0;
    this._env = this.env.bind(this);
    this._onDeath = this.onDeath.bind(this);
    this.start({ mode: 'attract', ci: 0 });
  }

  setDepth(vh) { this.VH = vh; clampTarget(this.flock, vh); }

  start({ mode, ci = 0, li = 0, skin = 'etourneau' }) {
    const ch = (this.ch = CHAPTERS[ci]);
    this.mode = mode; this.ci = ci; this.li = li; this.skin = skin;
    this.epoch++;
    this.dist = 0; this.t = 0; this.state = 'play'; this.stateT = 0;
    this.parts = []; this.strays = []; this.feathersA = []; this.canyons = []; this.spires = [];
    this.storms = []; this.winds = []; this.falcons = []; this.pending = [];
    this.next = 0; this.got = 0; this.lost = 0; this.causes = [0, 0, 0, 0];
    this.flash = 0; this.hurt = 0; this.shake = 0;
    this.holding = false; this.pid = null; this.idle = 9; this.hud = {};
    let startN;
    if (mode === 'level') {
      const lv = buildLevel(ci, li);
      this.ents = lv.ents; this.endD = lv.endD; this.total = lv.total; this.speed = lv.speed; startN = lv.start;
      this.gen = null;
    } else if (mode === 'endless') {
      this.gen = makeGen((Date.now() & 0xfffff) + 1);
      for (let i = 0; i < 4; i++) this.gen.addRandom(0);
      this.ents = this.gen.ents; this.endD = Infinity; this.total = 0; this.speed = 92; startN = 32;
    } else {
      // écran-titre : survol libre d'un décor tiré du chapitre en cours
      this.gen = makeGen(77 + ci * 13);
      this.gen.d = 900;
      for (const tok of ['spires:5', 'canyon:150:40:1100', 'spires:7', 'canyon:160:50:1300']) this.gen.add(tok);
      this.gen.sort();
      this.ents = this.gen.ents.filter((e) => e.t === 'canyon' || e.t === 'spire');
      this.attractLen = this.gen.d + 300;
      this.endD = Infinity; this.total = 0; this.speed = 40; startN = 150; this.gen = null;
    }
    const f = this.flock;
    f.n = 0; f.hold = 0; f.tx = VW / 2; f.ty = this.VH * (mode === 'attract' ? 0.56 : 0.62);
    for (let i = 0; i < startN; i++) {
      const a = Math.random() * TAU, rad = Math.sqrt(Math.random()) * 46;
      f.add(f.tx + Math.cos(a) * rad, f.ty + Math.sin(a) * rad, Math.cos(a + 1.6) * 60, Math.sin(a + 1.6) * 60);
    }
    f.cx = f.tx; f.cy = f.ty; f.ptx = f.tx; f.pty = f.ty; f.tvx = 0; f.tvy = 0;
    audio.setScene(ch.root, mode !== 'attract');
  }

  /* ---------- entrées tactiles (glissement relatif) ---------- */
  down(id, x, y) {
    if (this.pid !== null) return;
    this.pid = id; this.holding = true; this.lx = x; this.ly = y; this.idle = 0;
  }
  move(id, x, y) {
    if (id !== this.pid) return;
    if (this.state === 'play') {
      this.flock.tx += (x - this.lx) * this.kx * 1.2; this.flock.ty += (y - this.ly) * this.ky * 1.2;
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
    for (let k = 0; k < 2; k++) this.spawn({ k: 'feather', x, y, vx: vx * 0.25 + (Math.random() - 0.5) * 60, vy: vy * 0.25 + (Math.random() - 0.5) * 60, life: 0.9 + Math.random() * 0.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9 });
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
    this.scroll = scroll;
    this.dist += scroll * dt;
    if (this.mode === 'attract' && this.dist > this.attractLen) { this.dist = 0; this.next = 0; this.canyons = []; this.spires = []; this.epoch++; }
    const dist = this.dist;

    // cible et resserrement
    let holdT = this.holding ? 1 : 0;
    if (this.mode === 'attract') {
      this.idle += dt;
      if (this.idle > 2.5) {
        const a = this.t * 0.42;
        f.tx += (VW / 2 + Math.sin(a) * 70 - f.tx) * dt * 1.5;
        f.ty += (VH * 0.56 + Math.sin(a * 2.03 + 0.6) * VH * 0.1 - f.ty) * dt * 1.5;
        holdT = 0.34 + 0.3 * Math.sin(this.t * 0.33);
      }
    } else if (this.state === 'arrive') {
      holdT = 1; f.tx += (VW / 2 - f.tx) * dt * 3; f.ty += (dist - this.endD - f.ty) * dt * 3;
    } else if (this.state === 'lost') holdT = 0;
    f.hold += (holdT - f.hold) * Math.min(1, dt * 7);

    // activation des entités à l'approche
    const ents = this.ents;
    while (this.next < ents.length && ents[this.next].d - dist < LOOK) {
      const e = ents[this.next++];
      if (e.t === 'stray') { e.taken = false; this.strays.push(e); }
      else if (e.t === 'feather') { e.taken = false; this.feathersA.push(e); }
      else if (e.t === 'canyon') this.canyons.push(e);
      else if (e.t === 'wind') this.winds.push(e);
      else if (e.t === 'spire') this.spires.push(e);
      else if (e.t === 'storm') {
        const r = rng(e.seed); e.tt = e.phase; e.fl = 0; e.bolts = []; e.puffs = []; e.x0 = e.x0 === undefined ? e.x : e.x0; e.x = e.x0;
        for (let k = 0; k < 10; k++) { const a = r() * TAU, d = Math.sqrt(r()) * e.r * 0.62; e.puffs.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, e.r * (0.42 + r() * 0.26), r()]); }
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
    if (this.gen && this.gen.d < dist + LOOK + 400) this.gen.addRandom(clamp(dist / 15000, 0, 1));

    const off = (e) => dist - e.d > VH + 260;
    while (this.strays.length && off(this.strays[0])) this.strays.shift();
    while (this.feathersA.length && off(this.feathersA[0])) this.feathersA.shift();
    while (this.spires.length && off(this.spires[0])) this.spires.shift();
    while (this.storms.length && off(this.storms[0])) this.storms.shift();
    while (this.canyons.length && dist - this.canyons[0].d0 - this.canyons[0].len > VH + 420) this.canyons.shift();
    while (this.winds.length && dist - this.winds[0].d0 - this.winds[0].len > VH + 60) this.winds.shift();

    f.update(dt, this.t, VH, this._env, this._onDeath);

    this.updateStorms(dt, playing);
    this.updateFalcons(dt);
    if (this.mode !== 'attract') this.collect();

    // vent visible
    for (const w of this.winds) {
      const y0 = dist - w.d0 - w.len, y1 = dist - w.d0;
      const a = Math.max(-200, y0), b = Math.min(VH, y1);
      if (b > a && Math.random() < 0.8) this.spawn({ k: 'streak', x: Math.random() * VW, y: a + Math.random() * (b - a), vx: Math.sign(w.f) * (240 + Math.random() * 140), vy: 0, life: 0.5 + Math.random() * 0.4 });
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
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.hurt = Math.max(0, this.hurt - dt * 1.3);
    this.shake = Math.max(0, this.shake - dt * 3);

    audio.wind(f.speed, f.hold);
    audio.tick(dt);

    // états de fin
    if (this.mode !== 'attract') {
      if (playing && dist >= this.endD + VH * 0.45) {
        this.state = 'arrive'; this.stateT = 0; this.hooks.onHint('');
        audio.win();
      } else if (this.state === 'arrive' && this.stateT > 2.7) this.finish(true);
      if ((playing || this.state === 'arrive') && f.n === 0) { this.state = 'lost'; this.stateT = 0; audio.lose(); buzz(120); }
      else if (this.state === 'lost' && this.stateT > 1.5) this.finish(false);

      const h = this.hud, prog = this.endD === Infinity ? -1 : clamp(dist / (this.endD + VH * 0.45), 0, 1);
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
      this.spawn({ k: 'ring', x: s.x, y: sy, vx: 0, vy: this.speed, life: 0.7 });
      this.hooks.onPop(`+${s.n}`, s.x, sy);
      for (let k = 0; k < 12; k++) { const a = Math.random() * TAU; this.spawn({ k: 'spark', x: s.x, y: sy, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, life: 0.6, c: 0 }); }
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
          for (let k = 0; k < 6; k++) { const a = Math.random() * TAU; this.spawn({ k: 'spark', x: fe.x, y: fy, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.45, c: 1 }); }
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
      const visible = sy > -st.r - 120 && sy < this.VH + st.r * 0.5;
      if (!visible || !playing) continue;
      if (before < P - 0.8 && now >= P - 0.8) audio.charge();
      if (now < before) {
        const r2 = st.r * st.r * 0.9;
        let killed = 0;
        for (let i = f.n - 1; i >= 0; i--) {
          const dx = f.x[i] - st.x, dy = f.y[i] - sy;
          if (dx * dx + dy * dy < r2) { this.onDeath(f.x[i], f.y[i], f.vx[i], f.vy[i], 3); f.kill(i); killed++; }
        }
        st.fl = 0.3; st.bolts = [];
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
    this.falcons.push({ st: 'warn', t: 0, side, ox: side < 0 ? -40 : VW + 40, oy: lerp(this.VH * 0.02, this.VH * 0.3, Math.random()), ax: this.flock.cx, ay: this.flock.cy, x: 0, y: 0, vx: 0, vy: 0, kills: 0 });
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
        this.spawn({ k: 'spark', x: fa.x, y: fa.y, vx: -fa.vx * 0.05, vy: -fa.vy * 0.05, life: 0.35, c: 2 });
        if (fa.x < -120 || fa.x > VW + 120 || fa.y > this.VH + 120 || fa.y < -160) {
          if (fa.kills) { this.shake = 0.4; buzz(40); }
          this.falcons.splice(i, 1);
        }
      }
    }
  }
}
