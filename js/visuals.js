// Audio-reactive visuals with a fixed per-frame budget.
//  - WebGL fluid (fluid.js): every sound pours dye and force into it, driven by that
//    sound's own live analyser; the organ bed keeps a slow current moving underneath.
//  - A light 2D overlay draws crisp forms on top (spectral mandalas, meeps, the stasis
//    dial...). Glows are pre-rendered sprites; forms are capped; nothing allocates per frame.
import { Fluid } from "./fluid.js";

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const MAX_FORMS = 24;
const DYE_GAIN = 0.42;   // overall ink strength poured into the fluid

const PALETTE = {
  Original: ["#f6c86a", "#fff0cf", "#7fd6c8"], Astronaut: ["#8fd8ff", "#d9c2ff", "#fff1c1"],
  CafeCuties: ["#ffb3c7", "#fff0d9", "#ffd08a"], SnowDay: ["#cfe9ff", "#ffffff", "#9cc7ff"],
  Elderwood: ["#b8e07a", "#ffe29a", "#6fc5a0"], Client: ["#f6c86a", "#ffffff", "#9fb8ff"],
};
const SCENE_TINT = {
  starfall: ["#3a4a9a", "#8a5ab0", "#e0a84a"], meeps: ["#2a7a8a", "#6a4ab0", "#e2b25a"],
  observatory: ["#2a5ab0", "#7a4ac0", "#6fc8f0"], cafe: ["#8a3a7a", "#c05a80", "#f0a0b8"],
  snow: ["#3a6ab0", "#7aa0d8", "#d8ecff"], elderwood: ["#2a7a4a", "#6a8a3a", "#c8d77a"],
  fate: ["#8a5a1a", "#b07a2a", "#ffcf6a"], song: ["#4a4ab0", "#9a5ab0", "#ffd88a"],
  homeward: ["#8a4a7a", "#3a7a9a", "#ffb07a"], beyond: ["#2a2a7a", "#5a3aa0", "#a898ff"],
};
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const unit = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Visuals {
  constructor(canvas, fluidCanvas) {
    this.cv = canvas; this.cx = canvas.getContext("2d");
    this.mobile = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 700;
    try { this.fluid = new Fluid(fluidCanvas, { mobile: this.mobile }); }
    catch (err) { console.warn("fluid disabled:", err.message); this.fluid = null; fluidCanvas.remove(); }
    fluidCanvas.addEventListener?.("webglcontextlost", (e) => { e.preventDefault(); this.fluid = null; });
    this.time = 0; this.slow = 1; this.frameN = 0;
    this.tint = SCENE_TINT.starfall.map(hex); this.tintTarget = this.tint;
    this.level = 0; this.low = 0; this.forms = []; this.sprites = new Map(); this.nextId = 0;
    this.stars = Array.from({ length: this.mobile ? 90 : 160 }, () => ({ x: Math.random(), y: Math.random(), z: rnd(.2, 1), ph: rnd(0, TAU), sp: rnd(.3, 1.4) }));
    this.bedT = 0; this.ft = []; this.degradeAt = 0;
    this.resize(); addEventListener("resize", () => this.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }
  resize() {
    const d = Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 2);
    this.W = innerWidth; this.H = innerHeight;
    this.cv.width = Math.round(this.W * d); this.cv.height = Math.round(this.H * d);
    this.cx.setTransform(d, 0, 0, d, 0, 0);
  }
  setScene(id) { this.tintTarget = (SCENE_TINT[id] || SCENE_TINT.starfall).map(hex); }
  attach(analyser) { this.an = analyser; this.fd = new Uint8Array(analyser.frequencyBinCount); }

  // pre-rendered glow sprite per colour (cheap drawImage instead of per-frame gradients)
  sprite(c) {
    const key = (c[0] | 0) * 65536 + (c[1] | 0) * 256 + (c[2] | 0);
    let s = this.sprites.get(key);
    if (!s) {
      s = document.createElement("canvas"); s.width = s.height = 64;
      const g = s.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},1)`); gr.addColorStop(.35, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},.35)`);
      gr.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      if (this.sprites.size > 64) this.sprites.clear();
      this.sprites.set(key, s);
    }
    return s;
  }
  glow(x, y, r, c, a) {
    if (a <= 0.01 || r <= 0) return;
    const cx = this.cx; cx.globalAlpha = Math.min(1, a); cx.drawImage(this.sprite(c), x - r, y - r, r * 2, r * 2); cx.globalAlpha = 1;
  }
  // fluid helpers: positions in px, colour 0..255 scaled by strength
  pour(x, y, dx, dy, c, k, r = 1) {
    if (!this.fluid) return;
    // saturate toward the colour (cream/white palettes would otherwise wash the fluid to beige)
    const m = (c[0] + c[1] + c[2]) / 3, s = 1.9, g = DYE_GAIN * k / 255;
    this.fluid.splat(x / this.W, y / this.H, dx, dy,
      [Math.max(0, m + (c[0] - m) * s) * g, Math.max(0, m + (c[1] - m) * s) * g, Math.max(0, m + (c[2] - m) * s) * g], r);
  }
  burst(x, y, c, k, n = 3, force = 380, r = 1) {
    const o = rnd(0, TAU);
    for (let i = 0; i < n; i++) { const th = o + (i / n) * TAU; this.pour(x, y, Math.cos(th) * force, Math.sin(th) * force, c, k / n, r); }
  }

  // ------------------------------------------------------------------ sound events
  spawn(ev) {
    if (ev.cat === "pad") return;
    const W = this.W, H = this.H, pal = (PALETTE[ev.skin] || PALETTE.Original).map(hex);
    const e = { id: this.nextId++, ev, pal, born: this.time, life: (ev.dur || 4) + 2, an: ev.an, amp: 0, ampSlow: 0, rot: rnd(0, TAU), spin: rnd(-.25, .25),
      x: W * (0.5 + 0.4 * (ev.pan || 0)) + rnd(-W * .06, W * .06), y: H * (0.55 - 0.16 * Math.log2(ev.rate || 1)) + rnd(-H * .15, H * .15) };
    if (e.an) e.fd = new Uint8Array(e.an.frequencyBinCount);
    switch (ev.cat) {
      case "chime": if (ev.kind === "drift") { e.type = "lantern"; e.R = rnd(34, 60); e.vx = rnd(-8, 8); e.vy = rnd(-12, -4); }
        else { e.type = "mandala"; e.R = rnd(46, 96); e.sym = [5, 6, 7, 8, 12][Math.random() * 5 | 0]; } break;
      case "meep": {  // one comet per melody layer; later phrases feed the same comet
        const c = this.forms.find(o => o.type === "comet" && o.ev.kind === ev.kind && this.time - o.born < o.life - 1);
        if (c) { c.an = ev.an; c.fd = e.fd; c.life = this.time - c.born + ev.dur + 3; return; }
        e.type = "comet"; e.x = (ev.pan || 0) < 0 ? W * .1 : W * .9; e.dir = e.x < W / 2 ? rnd(-.4, .4) : Math.PI + rnd(-.4, .4); e.speed = rnd(110, 170); break;
      }
      case "spawn": e.type = "meep"; e.vx = rnd(-70, 70); e.vy = rnd(-60, -25); e.r = rnd(7, 11); e.life = rnd(6, 9); break;
      case "emote": e.type = "petals"; e.n = 6 + (Math.random() * 4 | 0); e.life = Math.min(e.life, 14); break;
      case "recall": e.type = "vortex"; e.x = W * (0.5 + 0.3 * (ev.pan || 0)); break;
      case "ceremony": e.type = "sunburst"; e.x = W * rnd(.3, .7); e.y = H * rnd(.3, .6); break;
      case "ult": e.type = ev.kind === "freeze" ? "stasis" : "sunburst"; e.x = W * rnd(.38, .62); e.y = H * rnd(.4, .6); break;
      case "shrine": e.type = "shrine"; e.life = 7; break;
      case "cloud": e.type = "swarm"; e.x = W * rnd(.25, .75); e.y = H * rnd(.25, .65); e.seeds = Array.from({ length: 40 }, () => [rnd(0, TAU), rnd(.15, 1), rnd(.3, 1.6)]); break;
      case "theme": case "theme_frag": {
        e.type = "constellation"; const k = ev.kind === "full" ? 18 : 8, cx = W * rnd(.25, .75), cy = H * rnd(.2, .45);
        e.pts = Array.from({ length: k }, () => [cx + rnd(-W * .3, W * .3), cy + rnd(-H * .18, H * .18), rnd(0, TAU)]).sort((a, b) => a[0] - b[0]); break;
      }
      case "cue": e.type = "shimmer"; e.life = 5; e.y = H * rnd(.3, .6); break;
      default: e.type = "mandala"; e.sym = 6; e.R = 50;
    }
    this.forms.push(e);
    if (this.forms.length > MAX_FORMS) {   // evict the oldest short-lived form, keep constellations
      const i = this.forms.findIndex(f => f.type !== "constellation"); this.forms.splice(i < 0 ? 0 : i, 1);
    }
  }

  // ------------------------------------------------------------------ frame
  frame(now) {
    const dtReal = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.frameN++;
    const freezing = this.forms.some(e => e.type === "stasis" && this.time - e.born > 2);
    this.slow += ((freezing ? 0.12 : 1) - this.slow) * 0.03;
    const dt = dtReal * this.slow; this.time += dt;
    if (this.an) {
      this.an.getByteFrequencyData(this.fd);
      let lo = 0, all = 0; for (let i = 0; i < this.fd.length; i++) { all += this.fd[i]; if (i < 24) lo += this.fd[i]; }
      this.level += ((all / this.fd.length / 255) - this.level) * 0.08;
      this.low += ((lo / 24 / 255) - this.low) * 0.03;
    }
    this.tint = this.tint.map((c, k) => lerp3(c, this.tintTarget[k], 0.006));
    this.bed(dt);

    const c = this.cx, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    c.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * s.sp + s.ph);
      c.fillStyle = `rgba(255,244,220,${((0.12 + 0.55 * tw * s.z) * (0.6 + this.level * 1.5)).toFixed(3)})`;
      const r = 0.4 + s.z * 1.1; c.fillRect(s.x * W, s.y * H, r, r);
    }
    for (let i = this.forms.length - 1; i >= 0; i--) {
      const e = this.forms[i], age = this.time - e.born;
      if (age > e.life) { this.forms.splice(i, 1); continue; }
      this.readAudio(e, age);
      this[`d_${e.type}`](c, e, age, dt);
    }
    c.globalCompositeOperation = "source-over";
    if (this.fluid) { this.fluid.timeScale = this.slow; this.fluid.step(dtReal); }
    this.watchPerf(dtReal);
    requestAnimationFrame((t) => this.frame(t));
  }

  // if the device can't hold the frame rate, step the fluid down a tier (never back up)
  watchPerf(dt) {
    if (!this.fluid || document.hidden) return;
    this.ft.push(dt); if (this.ft.length > 90) this.ft.shift();
    if (this.ft.length < 90 || this.time < this.degradeAt) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length;
    if (avg > 0.024 && this.fluid.lowerQuality()) { this.ft.length = 0; this.degradeAt = this.time + 4; }
  }

  // organ bed: a slow current on a drifting path, coloured by the scene, swelling with the bass
  bed(dt) {
    this.bedT += dt;
    if (this.bedT < 0.3) return; this.bedT = 0;
    const t = this.time * 0.07, W = this.W, H = this.H;
    const x = W * (0.5 + 0.38 * Math.sin(t * 1.3)), y = H * (0.55 + 0.3 * Math.sin(t * 0.9 + 1.7));
    const dx = Math.cos(t * 1.3) * 1.3 * 0.38 * W * 0.9, dy = Math.cos(t * 0.9 + 1.7) * 0.9 * 0.3 * H * 0.9;
    const k = 0.03 + this.low * 0.22, col = this.tint[(this.frameN >> 5) % 3];
    this.pour(x, y, dx * 0.6, dy * 0.6, col, k, 1.6);
    this.pour(W - x, H - y, -dx * 0.5, -dy * 0.5, this.tint[(this.frameN >> 6) % 3], k * 0.7, 1.3);
  }

  readAudio(e, age) {
    let a;
    if (e.an) { e.an.getByteFrequencyData(e.fd); let s = 0; for (let i = 1; i < 64; i++) s += e.fd[i]; a = s / 63 / 255; }
    else a = Math.max(0, 1 - age / Math.max(1, e.life - 2)) * 0.5;
    e.onset = a - e.ampSlow > 0.07 && a > 0.12 && (this.time - (e.lastOnset || 0)) > 0.18;
    if (e.onset) e.lastOnset = this.time;
    e.amp += (a - e.amp) * 0.35; e.ampSlow += (a - e.ampSlow) * 0.05;
    e.tick = (this.frameN + e.id) % 3 === 0;   // each form feeds the fluid every third frame
  }
  band(e, i, n) {
    if (!e.fd) return e.amp;
    const a = Math.floor(2 * Math.pow(48, i / n)), b = Math.max(a + 1, Math.floor(2 * Math.pow(48, (i + 1) / n)));
    let m = 0; for (let k = a; k < b; k++) m = Math.max(m, e.fd[k]); return m / 255;
  }
  env(e, age, fin, fout) { return Math.max(0, Math.min(1, age / fin, (e.life - age) / fout)); }

  // ------------------------------------------------------------------ forms
  mandalaPath(c, e, x, y, R, sym, rot, bands, lo) {
    const steps = sym * bands * 2; c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const j = i % (bands * 2), b = j < bands ? j : bands * 2 - 1 - j;
      const r = R * (0.25 + 1.1 * this.band(e, lo + b, bands + lo + 4)), th = rot + (i / steps) * TAU;
      i ? c.lineTo(x + Math.cos(th) * r, y + Math.sin(th) * r) : c.moveTo(x + Math.cos(th) * r, y + Math.sin(th) * r);
    }
    c.closePath();
  }
  stroke(c, col, a, w) { c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`; c.lineWidth = w; c.stroke(); }

  d_mandala(c, e, age, dt) {
    const A = Math.min(1, e.amp * 2.2) * this.env(e, age, .05, 2.5);
    e.rot += e.spin * dt;
    this.glow(e.x, e.y, e.R * 1.6 * (0.5 + A), e.pal[0], 0.5 * A);
    this.mandalaPath(c, e, e.x, e.y, e.R * (0.7 + A * .6), e.sym, e.rot, 7, 0); this.stroke(c, e.pal[0], .75 * A, 1.5);
    this.mandalaPath(c, e, e.x, e.y, e.R * .62 * (0.7 + A * .6), e.sym, -e.rot * 1.6, 7, 3); this.stroke(c, e.pal[1], .6 * A, 1);
    this.glow(e.x, e.y, 14 + 20 * A, e.pal[1], A);
    if (age < 0.1 || e.onset) this.burst(e.x, e.y, e.pal[0], 0.9, 3, 420, 1.2);
    else if (e.tick && A > .05) { const th = e.rot * 3; this.pour(e.x, e.y, Math.cos(th) * 160 * A, Math.sin(th) * 160 * A, e.pal[2], 0.25 * A, 0.8); }
  }
  d_lantern(c, e, age, dt) {
    e.x += e.vx * dt; e.y += e.vy * dt; e.rot += .12 * dt;
    const A = (0.35 + Math.min(1, e.amp * 2)) * this.env(e, age, 5, 7);
    this.glow(e.x, e.y, e.R * 1.8, e.pal[0], 0.45 * A);
    this.mandalaPath(c, e, e.x, e.y, e.R * (0.6 + A * .4), 6, e.rot, 6, 1); this.stroke(c, e.pal[1], .45 * A, 1);
    this.glow(e.x, e.y, 16, e.pal[1], A);
    if (e.tick) this.pour(e.x, e.y, e.vx * 4, e.vy * 6 - 40, e.pal[0], 0.18 * A, 1.4);
  }
  d_comet(c, e, age, dt) {
    e.dir += (Math.sin(this.time * 0.7 + e.id) * 0.8 + Math.sin(this.time * 1.9 + e.id * 3) * 0.5) * dt;
    const sp = e.speed * (0.5 + e.amp * 1.4), vx = Math.cos(e.dir) * sp, vy = Math.sin(e.dir) * sp * .8;
    e.x += vx * dt; e.y += vy * dt;
    if (e.x < 0 || e.x > this.W) { e.dir = Math.PI - e.dir; e.x = Math.max(0, Math.min(this.W, e.x)); }
    if (e.y < this.H * .1 || e.y > this.H * .9) { e.dir = -e.dir; e.y = Math.max(this.H * .1, Math.min(this.H * .9, e.y)); }
    const A = (0.3 + Math.min(1, e.amp * 2.5)) * this.env(e, age, .5, 3);
    this.glow(e.x, e.y, 22 + 34 * A, e.pal[0], 0.7 * A);
    this.glow(e.x, e.y, 6, e.pal[1], A);
    if (e.onset) this.burst(e.x, e.y, e.pal[1], 0.8, 3, 380, 0.9);     // each note flares
    if (e.tick) this.pour(e.x, e.y, vx * 3, vy * 3, e.pal[this.frameN % 2 ? 0 : 2], 0.35 * A, 0.9);  // the melody's wake
  }
  d_meep(c, e, age, dt) {    // cream orb with an orange stripe and a wisp tail, like the splash-art meeps
    e.vy += 8 * dt; e.vx *= 1 - .3 * dt; e.x += e.vx * dt; e.y += (e.vy + Math.sin(age * 3 + e.id) * 25) * dt;
    const A = (0.6 + Math.min(1, e.amp * 2) * .4) * this.env(e, age, .3, 2), r = e.r * (1 + e.amp * .6);
    this.glow(e.x, e.y, r * 3.2, e.pal[0], 0.55 * A);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(255,240,205,${(0.95 * A).toFixed(3)})`; c.beginPath(); c.arc(e.x, e.y, r, 0, TAU); c.fill();
    const face = e.vx < 0 ? 1 : -1;
    c.beginPath(); c.arc(e.x + face * r * .9, e.y, r * 1.05, face > 0 ? Math.PI - .9 : -.9, face > 0 ? Math.PI + .9 : .9);
    this.stroke(c, [214, 120, 50], .9 * A, r * .22);
    c.beginPath(); c.moveTo(e.x, e.y + r); c.quadraticCurveTo(e.x + Math.sin(age * 7) * 7, e.y + r * 2.3, e.x - Math.sign(e.vx) * 5, e.y + r * 3.3);
    this.stroke(c, [255, 236, 180], .7 * A, 2);
    c.globalCompositeOperation = "lighter";
    if (age < 0.1) this.burst(e.x, e.y, e.pal[1], 0.6, 3, 300, 0.8);
    else if (e.tick) this.pour(e.x, e.y + r, -e.vx * 2, 60, e.pal[2], 0.12 * A, 0.6);
  }
  d_petals(c, e, age, dt) {
    const A = (0.25 + Math.min(1, e.amp * 2)) * this.env(e, age, .6, 3); e.rot += .2 * dt;
    for (let k = 0; k < e.n; k++) {
      const v = this.band(e, k % 8, 8), th = e.rot + (k / e.n) * TAU, len = 30 + v * 110 * A + age * 4, m = len * .55, col = e.pal[k % 3];
      c.beginPath(); c.moveTo(e.x, e.y);
      c.quadraticCurveTo(e.x + Math.cos(th + .5) * m, e.y + Math.sin(th + .5) * m, e.x + Math.cos(th) * len, e.y + Math.sin(th) * len);
      c.quadraticCurveTo(e.x + Math.cos(th - .5) * m, e.y + Math.sin(th - .5) * m, e.x, e.y);
      this.stroke(c, col, .55 * A, 1);
    }
    this.glow(e.x, e.y, 34, e.pal[1], 0.6 * A);
    if (e.onset) this.burst(e.x, e.y, e.pal[(Math.random() * 3) | 0], 0.7, 4, 300, 1);
  }
  d_vortex(c, e, age, dt) {
    const A = (0.3 + Math.min(1, e.amp * 2)) * this.env(e, age, 1, 3); e.rot += (0.8 + A) * dt;
    for (let k = 0; k < 3; k++) {
      c.beginPath(); c.ellipse(e.x, e.y, 50 + k * 45 + e.amp * 40, (50 + k * 45) * .42, 0, e.rot * (k % 2 ? -1 : 1), e.rot * (k % 2 ? -1 : 1) + Math.PI * 1.3);
      this.stroke(c, e.pal[k], .35 * A, 1.2);
    }
    if (e.tick) {   // stir a whirlpool: tangential pushes around the centre
      const th = e.rot * 2, R = 70;
      this.pour(e.x + Math.cos(th) * R, e.y + Math.sin(th) * R * .5, -Math.sin(th) * 520 * A, Math.cos(th) * 260 * A - 60, e.pal[(this.frameN >> 2) % 3], 0.3 * A, 1.1);
    }
  }
  d_sunburst(c, e, age, dt) {
    const A = Math.min(1, e.amp * 2.2 + (age < .4 ? .6 : 0)) * this.env(e, age, .05, 2.5); e.rot += .1 * dt;
    c.beginPath();
    for (let i = 0; i < 72; i++) {
      const v = this.band(e, i % 18, 18), th = e.rot + (i / 72) * TAU, r0 = 26 + age * 20, r1 = r0 + 30 + v * 230 * A;
      c.moveTo(e.x + Math.cos(th) * r0, e.y + Math.sin(th) * r0); c.lineTo(e.x + Math.cos(th) * r1, e.y + Math.sin(th) * r1);
    }
    this.stroke(c, e.pal[0], .55 * A, 1.4);
    this.glow(e.x, e.y, 70 + 90 * A, e.pal[0], .6 * A);
    if (age < 0.1 || e.onset) this.burst(e.x, e.y, e.pal[1], 1.4, 6, 700, 1.4);
  }
  d_stasis(c, e, age, dt) {   // Tempered Fate: a golden dial; the fluid and the whole sky slow while it holds
    const A = (0.4 + Math.min(1, e.amp * 2)) * this.env(e, age, 3, 3), R = 80 + 60 * this.env(e, age, 3, 3) + e.amp * 30, col = [255, 214, 120];
    this.glow(e.x, e.y, R * 1.4, col, .4 * A);
    c.beginPath(); c.arc(e.x, e.y, R, 0, TAU); this.stroke(c, col, .85 * A, 2.5);
    c.beginPath();
    for (let k = 0; k < 60; k++) {
      const th = (k / 60) * TAU + age * .05, l = (k % 5 ? 6 : 14) + this.band(e, k % 12, 12) * 26;
      c.moveTo(e.x + Math.cos(th) * (R - l), e.y + Math.sin(th) * (R - l)); c.lineTo(e.x + Math.cos(th) * R, e.y + Math.sin(th) * R);
    }
    for (const [sp, len] of [[0.35, .75], [0.03, .5]]) { const h = age * sp; c.moveTo(e.x, e.y); c.lineTo(e.x + Math.cos(h) * R * len, e.y + Math.sin(h) * R * len); }
    this.stroke(c, col, .85 * A, 1.2);
    this.mandalaPath(c, e, e.x, e.y, R * .45, 12, age * .1, 6, 0); this.stroke(c, col, .5 * A, 1);
    if (e.tick && this.frameN % 6 === 0) { const th = age; this.pour(e.x + Math.cos(th) * R, e.y + Math.sin(th) * R, -Math.sin(th) * 200, Math.cos(th) * 200, col, 0.3 * A, 1); }
  }
  d_shrine(c, e, age, dt) {
    const A = (0.3 + Math.min(1, e.amp * 2)) * this.env(e, age, .3, 3), g = [190, 255, 180];
    this.glow(e.x, e.y, 60, g, .45 * A);
    for (const s of [1, 1.6]) {
      c.beginPath();
      for (let k = 0; k <= 6; k++) { const th = (k / 6) * TAU + Math.PI / 6 + age * .2 * s, r = 24 * s * (1 + e.amp * .6); k ? c.lineTo(e.x + Math.cos(th) * r, e.y + Math.sin(th) * r) : c.moveTo(e.x + Math.cos(th) * r, e.y + Math.sin(th) * r); }
      this.stroke(c, g, .7 * A, 1.5);
    }
    if (e.tick) this.pour(e.x + rnd(-20, 20), e.y, 0, -260, g, 0.2 * A, 0.9);
  }
  d_swarm(c, e, age, dt) {
    const A = (0.3 + Math.min(1, e.amp * 2.5)) * this.env(e, age, 3, 5);
    e.seeds.forEach(([ph, rr, sp], i) => {
      const v = this.band(e, i % 10, 10), th = ph + age * sp * .6, R = 20 + rr * 160 * (0.5 + v);
      this.glow(e.x + Math.cos(th) * R, e.y + Math.sin(th) * R * .6, 3 + v * 7, e.pal[i % 3], .9 * A);
    });
    if (e.tick) { const th = rnd(0, TAU), R = rnd(20, 150); this.pour(e.x + Math.cos(th) * R, e.y + Math.sin(th) * R * .6, rnd(-120, 120), rnd(-120, 120), e.pal[this.frameN % 3], 0.14 * A, 0.6); }
  }
  d_constellation(c, e, age, dt) {
    const A = (0.35 + Math.min(1, e.amp * 2)) * this.env(e, age, 4, 6);
    const shown = Math.min(e.pts.length, 1 + Math.floor(age / Math.max(1.5, (e.life - 8) / e.pts.length)));
    c.beginPath(); for (let i = 1; i < shown; i++) { c.moveTo(e.pts[i - 1][0], e.pts[i - 1][1]); c.lineTo(e.pts[i][0], e.pts[i][1]); }
    this.stroke(c, [255, 230, 180], .28 * A, 1);
    for (let i = 0; i < shown; i++) {
      const [x, y, ph] = e.pts[i], v = this.band(e, i % 10, 10);
      this.glow(x, y, 5 + v * 22 * A, [255, 236, 190], (0.5 + 0.5 * Math.sin(age * 2 + ph)) * A);
    }
    if (e.tick && shown > 1) {   // an aurora current running along the newest line
      const [x0, y0] = e.pts[shown - 2], [x1, y1] = e.pts[shown - 1], u = (age * .5) % 1;
      this.pour(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, (x1 - x0) * .6, (y1 - y0) * .6, this.tint[2], 0.25 * A, 1.3);
    }
  }
  d_shimmer(c, e, age) {
    const u = age / e.life, A = Math.sin(Math.PI * u), x = u * this.W * 1.2 - this.W * .1;
    this.glow(x, e.y, 50, e.pal[0], .5 * A);
    if (e.tick) this.pour(x, e.y, 500, rnd(-40, 40), e.pal[1], 0.2 * A, 0.9);
  }
}
