// Bande-son entièrement synthétisée (Web Audio) : aucune ressource à charger.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const semi = (n) => Math.pow(2, n / 12);

export const audio = {
  ctx: null, on: true, root: 174.6, playing: false,
  _next: 2, _lastDie: 0, _combo: 0, _comboT: 0,

  /** À appeler depuis un geste utilisateur (exigence des navigateurs mobiles). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.8 : 0;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);

    this.echo = c.createDelay(1); this.echo.delayTime.value = 0.36;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const wet = c.createGain(); wet.gain.value = 0.5;
    this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.master);

    // nappe : trois voix désaccordées dans un filtre qui respire
    this.padGain = c.createGain(); this.padGain.gain.value = 0;
    this.padFilter = c.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 520;
    this.padFilter.connect(this.padGain).connect(this.master);
    this.voices = [1, 1.498, 2.004, 0.5].map((m, i) => {
      const o = c.createOscillator(); o.type = i === 3 ? 'sine' : 'triangle';
      o.frequency.value = this.root * m; o.detune.value = (i - 1.5) * 5;
      const g = c.createGain(); g.gain.value = i === 3 ? 0.5 : 0.22;
      o.connect(g).connect(this.padFilter); o.start();
      return { o, m };
    });
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 190;
    lfo.connect(lg).connect(this.padFilter.frequency); lfo.start();

    // vent : bruit filtré, piloté par la vitesse de la nuée
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 9; }
    this.noiseBuf = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.5;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master); src.start();
    this.setScene(this.root, this.playing);
  },

  setOn(v) {
    this.on = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  },
  suspend(v) { if (this.ctx) (v ? this.ctx.suspend() : this.ctx.resume()); },

  setScene(root, playing = true) {
    this.root = root; this.playing = playing;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v) => v.o.frequency.setTargetAtTime(root * v.m, t, 0.6));
    this.padGain.gain.setTargetAtTime(playing ? 0.085 : 0.05, t, 0.8);
  },

  wind(speed, hold) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(Math.min(0.11, 0.015 + speed / 2600), t, 0.2);
    this.windFilter.frequency.setTargetAtTime(380 + speed * 2.2 + hold * 250, t, 0.2);
  },

  tone(freq, dur, { type = 'sine', vol = 0.2, echo = 0, attack = 0.005, slide = 0 } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e).connect(this.echo); }
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },

  /** Mélodie générative lente pendant le vol. */
  tick(dt) {
    this._comboT -= dt; if (this._comboT <= 0) this._combo = 0;
    if (!this.playing) return;
    this._next -= dt;
    if (this._next > 0) return;
    this._next = 1.6 + Math.random() * 3.2;
    const n = SCALE[Math.floor(Math.random() * 6)];
    this.tone(this.root * 2 * semi(n), 2.4, { vol: 0.05, echo: 0.7, attack: 0.03 });
    if (Math.random() < 0.35) this.tone(this.root * 2 * semi(n + 7), 2.0, { vol: 0.025, echo: 0.6, attack: 0.2 });
  },

  collect() {
    const k = Math.min(this._combo++, SCALE.length - 1); this._comboT = 4;
    const f = this.root * 4 * semi(SCALE[k]);
    this.tone(f, 0.7, { vol: 0.16, echo: 0.6 });
    this.tone(f * 1.5, 0.5, { vol: 0.07, echo: 0.5, attack: 0.06 });
  },
  feather() { this.tone(this.root * 8 * semi(SCALE[Math.floor(Math.random() * 4) + 2]), 0.22, { vol: 0.06, echo: 0.3 }); },
  die() {
    const now = performance.now();
    if (now - this._lastDie < 55) return;
    this._lastDie = now;
    this.tone(150 + Math.random() * 60, 0.16, { type: 'triangle', vol: 0.11, slide: 0.5 });
  },
  screech() {
    this.tone(1900, 0.55, { type: 'sawtooth', vol: 0.06, slide: 0.55, echo: 0.4, attack: 0.03 });
    this.tone(2500, 0.4, { type: 'square', vol: 0.02, slide: 0.6 });
  },
  dive() { this.noise(0.5, 2600, 0.22, 'bandpass'); },
  charge() { this.tone(90, 0.6, { type: 'sawtooth', vol: 0.03, slide: 2.2, attack: 0.3 }); },
  thunder() { this.noise(1.3, 900, 0.5); this.tone(55, 0.9, { vol: 0.3, slide: 0.5 }); },
  tap() { this.tone(660, 0.09, { vol: 0.06 }); },
  win() { [0, 4, 7, 12, 16].forEach((n, i) => setTimeout(() => this.tone(this.root * 2 * semi(n), 1.4, { vol: 0.13, echo: 0.6 }), i * 130)); },
  star(i) { this.tone(this.root * 4 * semi([0, 4, 7][i] || 0), 0.6, { vol: 0.12, echo: 0.5 }); },
  lose() { [7, 3, 0].forEach((n, i) => setTimeout(() => this.tone(this.root * semi(n), 1.2, { type: 'triangle', vol: 0.14, echo: 0.5 }), i * 220)); },
};

export function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* non pris en charge */ }
}
