import { lerp, clamp } from './util.js';
import { VW } from './levels.js';

const NEIGH = 34, NEIGH2 = NEIGH * NEIGH;

/**
 * Nuée : simulation de type « boids » (séparation, alignement, attraction vers
 * une cible). `hold` (0..1) resserre la nuée quand le doigt est posé.
 */
export class Flock {
  constructor(max = 340) {
    this.max = max;
    this.n = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.ax = new Float32Array(max); this.ay = new Float32Array(max);
    this.ph = new Float32Array(max);
    this.dead = new Uint8Array(max);
    this.tx = VW / 2; this.ty = 400;
    this.hold = 0; this.cx = VW / 2; this.cy = 400; this.speed = 0;
    this.spin = 1; this.dense = 1; this.ptx = this.tx; this.pty = this.ty; this.tvx = 0; this.tvy = 0;
  }

  add(x, y, vx = 0, vy = 0) {
    if (this.n >= this.max) return false;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.ph[i] = Math.random();
    return true;
  }

  kill(i) {
    const l = --this.n;
    this.x[i] = this.x[l]; this.y[i] = this.y[l];
    this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.ph[i] = this.ph[l];
  }

  /**
   * @param env  (i, x, y, out) => void — ajoute des forces dans out.ax/out.ay
   *             et met out.dead = true si l'oiseau est perdu.
   * @param onDeath (x, y, vx, vy) => void
   */
  update(dt, t, VH, env, onDeath) {
    const { x, y, vx, vy, ax, ay, ph, dead } = this;
    const n = this.n, h = this.hold;
    // plus la nuée est grande, plus elle se serre : elle reste pilotable à 300 oiseaux
    const dense = clamp(Math.sqrt(70 / Math.max(n, 1)), 0.58, 1);
    this.dense = dense;
    const sepR = lerp(21, 10.5, h) * dense, sepR2 = sepR * sepR, sepK = lerp(520, 760, h);
    const aliK = 0.07;

    for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; }
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i];
      for (let j = i + 1; j < n; j++) {
        const dx = x[j] - xi;
        if (dx > NEIGH || dx < -NEIGH) continue;
        const dy = y[j] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > NEIGH2) continue;
        if (d2 < sepR2 && d2 > 1e-4) {
          const d = Math.sqrt(d2), f = ((1 - d / sepR) * sepK) / d;
          ax[i] -= dx * f; ay[i] -= dy * f; ax[j] += dx * f; ay[j] += dy * f;
        }
        const dvx = (vx[j] - vx[i]) * aliK, dvy = (vy[j] - vy[i]) * aliK;
        ax[i] += dvx; ay[i] += dvy; ax[j] -= dvx; ay[j] -= dvy;
      }
    }

    // vitesse de la cible : l'amortissement est relatif à elle, la nuée ne traîne pas en virage
    const k = Math.min(1, dt * 10);
    this.tvx += (clamp((this.tx - this.ptx) / dt, -400, 400) - this.tvx) * k;
    this.tvy += (clamp((this.ty - this.pty) / dt, -400, 400) - this.tvy) * k;
    this.ptx = this.tx; this.pty = this.ty;
    const rvx = this.tvx * h, rvy = this.tvy * h;
    const kT = lerp(2.3, 11, h), damp = lerp(1.0, 2.6, h);
    const wander = lerp(125, 105, h), swirl = lerp(45, 105, h) * this.spin;
    const minS = lerp(36, 52, h), maxS = 340;
    const out = this._out || (this._out = { ax: 0, ay: 0, dead: 0 });
    let sx = 0, sy = 0, ss = 0;

    for (let i = 0; i < n; i++) {
      let dx = this.tx - x[i], dy = this.ty - y[i];
      const d = Math.hypot(dx, dy) + 1e-3;
      dx /= d; dy /= d;
      const pull = Math.min(d, 150) * kT, sw = swirl * Math.min(1, d / 28);
      let fx = ax[i] + dx * pull - dy * sw - (vx[i] - rvx) * damp;
      let fy = ay[i] + dy * pull + dx * sw - (vy[i] - rvy) * damp;
      const a = ph[i] * 40 + t * (1.0 + ph[i] * 1.2);
      fx += Math.cos(a) * wander; fy += Math.sin(a * 1.31) * wander;

      out.ax = 0; out.ay = 0; out.dead = 0;
      if (env) env(i, x[i], y[i], out);
      dead[i] = out.dead | 0;
      fx += out.ax; fy += out.ay;

      let nvx = vx[i] + fx * dt, nvy = vy[i] + fy * dt;
      const sp = Math.hypot(nvx, nvy) + 1e-3;
      if (sp > maxS) { nvx *= maxS / sp; nvy *= maxS / sp; }
      else if (sp < minS) { nvx *= minS / sp; nvy *= minS / sp; }
      vx[i] = nvx; vy[i] = nvy;
      let nx = x[i] + nvx * dt, ny = y[i] + nvy * dt;
      if (nx < 5) { nx = 5; vx[i] = Math.abs(nvx); } else if (nx > VW - 5) { nx = VW - 5; vx[i] = -Math.abs(nvx); }
      if (ny < 5) { ny = 5; vy[i] = Math.abs(nvy); } else if (ny > VH - 5) { ny = VH - 5; vy[i] = -Math.abs(nvy); }
      x[i] = nx; y[i] = ny;
      sx += nx; sy += ny; ss += Math.min(sp, maxS);
    }
    if (n) { this.cx = sx / n; this.cy = sy / n; this.speed = ss / n; }

    for (let i = n - 1; i >= 0; i--) {
      if (dead[i]) { if (onDeath) onDeath(x[i], y[i], vx[i], vy[i], dead[i]); this.kill(i); }
    }
  }

  /** Trace toute la nuée, regroupée par couleur pour limiter les appels canvas. */
  draw(ctx, t, colors, size = 1) {
    const { x, y, vx, vy, ph } = this, n = this.n, k = colors.length;
    for (let c = 0; c < k; c++) {
      ctx.fillStyle = colors[c];
      ctx.beginPath();
      for (let i = c; i < n; i += k) {
        const sp = Math.hypot(vx[i], vy[i]) + 1e-3;
        const ux = vx[i] / sp, uy = vy[i] / sp;
        const flap = 0.3 + 0.7 * Math.abs(Math.sin(t * 13 + ph[i] * 30));
        const w = 4.4 * size * flap, l = 4.6 * size;
        const px = -uy * w, py = ux * w;
        const bx = x[i] - ux * l * 0.55, by = y[i] - uy * l * 0.55;
        ctx.moveTo(x[i] + ux * l, y[i] + uy * l);
        ctx.lineTo(bx + px, by + py);
        ctx.lineTo(x[i] - ux * l * 0.1, y[i] - uy * l * 0.1);
        ctx.lineTo(bx - px, by - py);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
}

export function clampTarget(f, VH) {
  f.tx = clamp(f.tx, 18, VW - 18);
  f.ty = clamp(f.ty, 70, VH - 50);
}
