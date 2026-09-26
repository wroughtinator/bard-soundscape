// Audio-reactive visuals. A drifting noise flow field carries thousands of particles
// (silky trails, glowing with the organ bed). Every sound that plays gets its own
// analyser, and its visual is drawn from that sound's live spectrum and loudness:
// chimes bloom into spectral mandalas, meep melodies are comets that spark on each note,
// ceremonies are sunbursts of frequency rays, recalls are vortices, the theme draws a
// constellation, and Tempered Fate slows the whole sky.

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ 3D value noise
const PERM = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const RV = new Float32Array(256).map(() => Math.random());
const fade = (t) => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const xf = x - X, yf = y - Y, zf = z - Z, u = fade(xf), v = fade(yf), w = fade(zf);
  const h = (i, j, k) => RV[PERM[PERM[PERM[(X + i) & 255] + ((Y + j) & 255)] + ((Z + k) & 255)]];
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
           l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const flowAngle = (x, y, t) => (noise3(x * 0.0017, y * 0.0017, t * 0.035) * 2 + noise3(x * 0.005, y * 0.005, t * 0.06) * 0.6) * TAU;

// ------------------------------------------------------------------ colour
const PALETTE = {
  Original: ["#f6c86a", "#fff0cf", "#7fd6c8"], Astronaut: ["#8fd8ff", "#d9c2ff", "#fff1c1"],
  CafeCuties: ["#ffb3c7", "#fff0d9", "#ffd08a"], SnowDay: ["#cfe9ff", "#ffffff", "#9cc7ff"],
  Elderwood: ["#b8e07a", "#ffe29a", "#6fc5a0"], Client: ["#f6c86a", "#ffffff", "#9fb8ff"],
};
const SCENE_TINT = {
  starfall: ["#1b2a5a", "#5a3a7a", "#e0a84a"], meeps: ["#173a4a", "#3a2a6a", "#e2b25a"],
  observatory: ["#102a5a", "#3a1f6a", "#6fc8f0"], cafe: ["#3a1f3f", "#6a2f4f", "#f0a0b8"],
  snow: ["#1a2c48", "#34507a", "#d8ecff"], elderwood: ["#10301f", "#2f4a1f", "#c8d77a"],
  fate: ["#2a1f10", "#4a2f10", "#ffcf6a"], song: ["#1f1f4a", "#4a2a5a", "#ffd88a"],
  homeward: ["#2a1f3a", "#1f3a4a", "#ffb07a"], beyond: ["#0c1024", "#1f1740", "#a898ff"],
};
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export class Visuals {
  constructor(canvas) {
    this.cv = canvas; this.cx = canvas.getContext("2d");
    this.trail = document.createElement("canvas"); this.tx = this.trail.getContext("2d");
    this.time = 0; this.slow = 1; this.slowTarget = 1;
    this.tint = SCENE_TINT.starfall.map(hex2rgb); this.tintTarget = this.tint.map(c => c.slice());
    this.level = 0; this.low = 0;
    this.emitters = []; this.sparks = [];
    this.resize(); addEventListener("resize", () => this.resize());
    const n = Math.round(Math.min(2200, (innerWidth * innerHeight) / 700));
    this.flow = Array.from({ length: n }, () => this.newFlow());
    this.stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), z: rnd(.2, 1), ph: rnd(0, TAU), sp: rnd(.3, 1.4) }));
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }
  newFlow() { return { x: Math.random() * this.W, y: Math.random() * this.H, age: 0, life: rnd(4, 14), hue: Math.random() }; }
  resize() {
    const d = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth; this.H = innerHeight; this.dpr = d;
    for (const [cv, cx] of [[this.cv, this.cx], [this.trail, this.tx]]) { cv.width = this.W * d; cv.height = this.H * d; cx.setTransform(d, 0, 0, d, 0, 0); }
  }
  setScene(id) { this.tintTarget = (SCENE_TINT[id] || SCENE_TINT.starfall).map(hex2rgb); }
  attach(analyser) { this.an = analyser; this.fd = new Uint8Array(analyser.frequencyBinCount); }

  // ------------------------------------------------------------------ sound events
  spawn(ev) {
    if (ev.cat === "pad") return;
    const W = this.W, H = this.H;
    const pal = (PALETTE[ev.skin] || PALETTE.Original).map(hex2rgb);
    const x = W * (0.5 + 0.4 * (ev.pan || 0)) + rnd(-W * .06, W * .06);
    const y = H * (0.55 - 0.16 * Math.log2(ev.rate || 1)) + rnd(-H * .15, H * .15);
    const e = { ev, pal, x, y, born: this.time, life: (ev.dur || 4) + 2, an: ev.an, amp: 0, ampSlow: 0, rot: rnd(0, TAU), spin: rnd(-.25, .25) };
    if (e.an) e.fd = new Uint8Array(e.an.frequencyBinCount);
    switch (ev.cat) {
      case "chime": e.type = ev.kind === "drift" ? "lantern" : "mandala"; e.sym = [5, 6, 7, 8, 12][Math.random() * 5 | 0]; e.R = ev.kind === "drift" ? rnd(40, 70) : rnd(50, 110);
        if (ev.kind === "drift") { e.vx = rnd(-8, 8); e.vy = rnd(-12, -4); } break;
      case "meep": {  // one comet per melody layer; later phrases feed the same comet
        const c = this.emitters.find(o => o.type === "comet" && o.ev.kind === ev.kind && this.time - o.born < o.life - 1);
        if (c) { c.an = ev.an; c.fd = e.fd; c.life = this.time - c.born + ev.dur + 3; return; }
        e.type = "comet"; e.x = (ev.pan || 0) < 0 ? W * .08 : W * .92; e.speed = rnd(90, 150); e.hist = []; break;
      }
      case "spawn": e.type = "meep"; e.vx = rnd(-60, 60); e.vy = rnd(-50, -20); e.r = rnd(7, 11); e.life = rnd(6, 9); break;
      case "emote": e.type = "petals"; e.n = 6 + (Math.random() * 4 | 0); e.life = Math.min(e.life, 14); break;
      case "recall": e.type = "vortex"; e.x = W * (0.5 + 0.3 * (ev.pan || 0)); break;
      case "ceremony": e.type = "sunburst"; e.x = W * rnd(.3, .7); e.y = H * rnd(.3, .6); break;
      case "ult": e.type = ev.kind === "freeze" ? "stasis" : "sunburst"; e.x = W * rnd(.38, .62); e.y = H * rnd(.4, .6); break;
      case "shrine": e.type = "shrine"; e.life = 7; break;
      case "cloud": e.type = "swarm"; e.x = W * rnd(.25, .75); e.y = H * rnd(.25, .65); e.seeds = Array.from({ length: 90 }, () => [rnd(0, TAU), rnd(.15, 1), rnd(.3, 1.6)]); break;
      case "theme": case "theme_frag": {
        e.type = "constellation"; const k = ev.kind === "full" ? 22 : 9;
        const cx = W * rnd(.25, .75), cy = H * rnd(.2, .45);
        e.pts = Array.from({ length: k }, () => [cx + rnd(-W * .3, W * .3), cy + rnd(-H * .18, H * .18), rnd(0, TAU)]);
        e.pts.sort((a, b) => a[0] - b[0]); break;
      }
      case "cue": e.type = "shimmer"; e.life = 5; break;
      default: e.type = "mandala"; e.sym = 6; e.R = 50;
    }
    this.emitters.push(e);
    if (this.emitters.length > 60) this.emitters.splice(0, this.emitters.length - 60);
  }

  // ------------------------------------------------------------------ frame
  frame(now) {
    const dtReal = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const freezing = this.emitters.some(e => e.type === "stasis" && this.time - e.born > 2);
    this.slowTarget = freezing ? 0.12 : 1; this.slow += (this.slowTarget - this.slow) * 0.03;
    const dt = dtReal * this.slow; this.time += dt;
    const W = this.W, H = this.H, c = this.cx, t = this.tx;
    if (this.an) {
      this.an.getByteFrequencyData(this.fd);
      let lo = 0, all = 0; for (let i = 0; i < this.fd.length; i++) { all += this.fd[i]; if (i < 24) lo += this.fd[i]; }
      this.level += ((all / this.fd.length / 255) - this.level) * 0.08;
      this.low += ((lo / 24 / 255) - this.low) * 0.03;
    }
    for (let k = 0; k < 3; k++) this.tint[k] = mix(this.tint[k], this.tintTarget[k], 0.006);

    // trail layer: fade what is there, then draw flow + sparks as streaks
    t.globalCompositeOperation = "destination-out";
    t.fillStyle = `rgba(0,0,0,${0.05 + 0.1 * (1 - this.slow)})`; t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = "lighter";
    this.drawFlow(t, dt);
    this.drawSparks(t, dt);

    // main layer
    c.clearRect(0, 0, W, H);
    c.globalCompositeOperation = "lighter";
    this.drawNebula(c);
    this.drawStars(c, dt);
    c.drawImage(this.trail, 0, 0, W, H);
    this.emitters = this.emitters.filter(e => {
      const age = this.time - e.born; if (age > e.life) return false;
      this.readAudio(e, age);
      this[`d_${e.type}`](c, e, age, dt);
      return true;
    });
    c.globalCompositeOperation = "source-over";
    requestAnimationFrame((ts) => this.frame(ts));
  }

  readAudio(e, age) {
    let a;
    if (e.an) {
      e.an.getByteFrequencyData(e.fd);
      let s = 0; for (let i = 1; i < 64; i++) s += e.fd[i]; a = s / 63 / 255;
    } else { a = Math.max(0, 1 - age / Math.max(1, e.life - 2)) * 0.5; }
    e.onset = a - e.ampSlow > 0.07 && a > 0.12 && (this.time - (e.lastOnset || 0)) > 0.18;
    if (e.onset) e.lastOnset = this.time;
    e.amp += (a - e.amp) * 0.35; e.ampSlow += (a - e.ampSlow) * 0.05;
  }
  band(e, i, n) {  // i-th of n log-spaced bands from the sound's own spectrum, 0..1
    if (!e.fd) return e.amp;
    const a = Math.floor(2 * Math.pow(48, i / n)), b = Math.max(a + 1, Math.floor(2 * Math.pow(48, (i + 1) / n)));
    let m = 0; for (let k = a; k < b; k++) m = Math.max(m, e.fd[k]); return m / 255;
  }

  // ------------------------------------------------------------------ background
  drawNebula(c) {
    const W = this.W, H = this.H, breathe = 0.25 + this.low * 1.5;
    [[.18, .82, .75], [.82, .25, .6], [.55, 1.0, .9]].forEach(([bx, by, br], k) => {
      const x = W * (bx + .06 * (noise3(k * 10, this.time * .02, 0) - .5)), y = H * (by + .06 * (noise3(0, k * 10, this.time * .02) - .5));
      const r = Math.max(W, H) * br, g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(this.tint[k], 0.26 * breathe)); g.addColorStop(1, rgba(this.tint[k], 0));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
  }
  drawStars(c, dt) {
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * s.sp + s.ph);
      c.fillStyle = `rgba(255,244,220,${(0.12 + 0.55 * tw * s.z) * (0.6 + this.level * 1.5)})`;
      const r = 0.4 + s.z * 1.1; c.fillRect(s.x * this.W, s.y * this.H, r, r);
    }
  }
  drawFlow(t, dt) {
    const speed = (18 + this.level * 140 + this.low * 60), col = this.tint[2], col2 = mix(this.tint[1], [255, 240, 210], .5);
    const a = 0.1 + this.low * 0.5 + this.level * 0.3;
    t.lineWidth = 1;
    t.beginPath(); t.strokeStyle = rgba(col, a);
    const alt = [];
    for (const p of this.flow) {
      const ang = flowAngle(p.x, p.y, this.time);
      const nx = p.x + Math.cos(ang) * speed * dt, ny = p.y + Math.sin(ang) * speed * dt;
      if (p.hue > .7) alt.push([p.x, p.y, nx, ny]); else { t.moveTo(p.x, p.y); t.lineTo(nx, ny); }
      p.x = nx; p.y = ny; p.age += dt;
      if (p.age > p.life || nx < -10 || ny < -10 || nx > this.W + 10 || ny > this.H + 10) Object.assign(p, this.newFlow());
    }
    t.stroke();
    t.beginPath(); t.strokeStyle = rgba(col2, a * 0.8);
    for (const [x0, y0, x1, y1] of alt) { t.moveTo(x0, y0); t.lineTo(x1, y1); } t.stroke();
  }
  emit(x, y, col, n, spd = 60, life = 1.6, size = 1.6) {
    for (let i = 0; i < n; i++) {
      const th = rnd(0, TAU), v = rnd(.3, 1) * spd;
      this.sparks.push({ x, y, vx: Math.cos(th) * v, vy: Math.sin(th) * v, age: 0, life: rnd(.6, 1) * life, col, size });
    }
    if (this.sparks.length > 2500) this.sparks.splice(0, this.sparks.length - 2500);
  }
  drawSparks(t, dt) {
    this.sparks = this.sparks.filter(s => {
      s.age += dt; if (s.age > s.life) return false;
      const ang = flowAngle(s.x, s.y, this.time), pull = 40;
      s.vx += (Math.cos(ang) * pull - s.vx) * dt * 1.2; s.vy += (Math.sin(ang) * pull - s.vy) * dt * 1.2;
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, a = 1 - s.age / s.life;
      t.strokeStyle = rgba(s.col, a * 0.9); t.lineWidth = s.size * a + 0.3;
      t.beginPath(); t.moveTo(s.x, s.y); t.lineTo(nx, ny); t.stroke();
      s.x = nx; s.y = ny; return true;
    });
  }
  glow(c, x, y, r, col, a) {
    if (r <= 0 || a <= 0.003) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  life(e, age, fin = 0.4, fout = 2) { return Math.min(1, age / fin, (e.life - age) / fout); }

  // ------------------------------------------------------------------ per-sound forms
  // spectral mandala: the chime's own spectrum, mirrored into k-fold symmetry
  mandalaPath(c, e, x, y, R, sym, rot, bands, lo) {
    const steps = sym * bands * 2;
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const j = i % (bands * 2), b = j < bands ? j : bands * 2 - 1 - j;
      const v = this.band(e, lo + b, bands + lo + 4);
      const r = R * (0.25 + 1.1 * v), th = rot + (i / steps) * TAU;
      i ? c.lineTo(x + Math.cos(th) * r, y + Math.sin(th) * r) : c.moveTo(x + Math.cos(th) * r, y + Math.sin(th) * r);
    }
    c.closePath();
  }
  d_mandala(c, e, age, dt) {
    const L = this.life(e, age, .05, 2.5), A = Math.min(1, e.amp * 2.2) * L;
    e.rot += e.spin * dt;
    this.glow(c, e.x, e.y, e.R * 2.4 * (0.5 + A), e.pal[0], 0.35 * A);
    for (const [k, R, lo, col] of [[0, e.R, 0, e.pal[0]], [1, e.R * .62, 3, e.pal[1]]]) {
      this.mandalaPath(c, e, e.x, e.y, R * (0.7 + A * 0.6), e.sym, e.rot * (k ? -1.6 : 1), 7, lo);
      c.fillStyle = rgba(col, 0.1 * A); c.fill();
      c.strokeStyle = rgba(col, 0.75 * A); c.lineWidth = k ? 1 : 1.5; c.stroke();
    }
    this.glow(c, e.x, e.y, 10 + 18 * A, e.pal[1], 0.9 * A);
    if (e.onset || age < 0.1) this.emit(e.x, e.y, e.pal[0], 26, 150, 2);
    if (Math.random() < A) this.emit(e.x, e.y, e.pal[2], 1, 60, 2.4, 1.2);
  }
  d_lantern(c, e, age, dt) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    const L = this.life(e, age, 5, 7), A = (0.35 + Math.min(1, e.amp * 2)) * L;
    e.rot += 0.12 * dt;
    this.glow(c, e.x, e.y, e.R * 3, e.pal[0], 0.3 * A);
    this.mandalaPath(c, e, e.x, e.y, e.R * (0.6 + A * .4), e.sym, e.rot, 6, 1);
    c.strokeStyle = rgba(e.pal[1], 0.45 * A); c.lineWidth = 1; c.stroke();
    this.glow(c, e.x, e.y, 14, e.pal[1], 0.8 * A);
    if (Math.random() < 0.5 * A) this.emit(e.x + rnd(-e.R, e.R) * .5, e.y + rnd(-e.R, e.R) * .5, e.pal[0], 1, 25, 3, 1.4);
  }
  d_comet(c, e, age, dt) {
    if (e.dir === undefined) e.dir = e.x < this.W / 2 ? rnd(-.3, .3) : Math.PI + rnd(-.3, .3);
    e.dir += (noise3(e.x * .004, e.y * .004, this.time * .3) - .5) * 3 * dt;   // wander
    const sp = e.speed * (0.5 + e.amp * 1.4);
    e.x += Math.cos(e.dir) * sp * dt; e.y += Math.sin(e.dir) * sp * dt * 0.8;
    if (e.x < 0 || e.x > this.W) { e.dir = Math.PI - e.dir; e.x = Math.max(0, Math.min(this.W, e.x)); }
    if (e.y < this.H * .1 || e.y > this.H * .9) { e.dir = -e.dir; e.y = Math.max(this.H * .1, Math.min(this.H * .9, e.y)); }
    const L = this.life(e, age, .5, 3), A = (0.3 + Math.min(1, e.amp * 2.5)) * L;
    e.hist.push([e.x, e.y]); if (e.hist.length > 50) e.hist.shift();
    c.lineCap = "round";
    for (let i = 1; i < e.hist.length; i++) {
      const u = i / e.hist.length;
      c.strokeStyle = rgba(e.pal[2], 0.5 * u * A); c.lineWidth = 1 + 7 * u * A;
      c.beginPath(); c.moveTo(...e.hist[i - 1]); c.lineTo(...e.hist[i]); c.stroke();
    }
    this.glow(c, e.x, e.y, 26 + 40 * A, e.pal[0], 0.55 * A);
    this.glow(c, e.x, e.y, 7, e.pal[1], A);
    if (e.onset) {           // each note of the melody bursts into a ring of sparks
      this.emit(e.x, e.y, e.pal[1], 18, 120, 1.6, 1.8);
      e.rings = (e.rings || []).concat([[e.x, e.y, this.time]]);
    }
    if (Math.random() < A) this.emit(e.x, e.y, e.pal[0], 2, 30, 1.8);
    e.rings = (e.rings || []).filter(([x, y, t0]) => {
      const k = this.time - t0; if (k > 1.4) return false;
      c.strokeStyle = rgba(e.pal[1], 0.6 * (1 - k / 1.4) * L); c.lineWidth = 1.2;
      c.beginPath(); c.arc(x, y, 8 + k * 60, 0, TAU); c.stroke(); return true;
    });
  }
  d_meep(c, e, age, dt) {   // cream orb with an orange stripe and a wisp tail, like the splash-art meeps
    const ang = flowAngle(e.x, e.y, this.time);
    e.vx += (Math.cos(ang) * 50 - e.vx) * dt * 0.6; e.vy += (Math.sin(ang) * 50 - 25 - e.vy) * dt * 0.6;
    e.x += e.vx * dt; e.y += e.vy * dt;
    const L = this.life(e, age, .3, 2), A = L * (0.6 + Math.min(1, e.amp * 2) * 0.4), r = e.r * (1 + e.amp * 0.6);
    this.glow(c, e.x, e.y, r * 5, e.pal[0], 0.4 * A);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(255,240,205,${0.95 * A})`; c.beginPath(); c.arc(e.x, e.y, r, 0, TAU); c.fill();
    c.strokeStyle = `rgba(214,120,50,${0.9 * A})`; c.lineWidth = r * 0.22;
    const face = e.vx < 0 ? 1 : -1;
    c.beginPath(); c.arc(e.x + face * r * .9, e.y, r * 1.05, face > 0 ? Math.PI - .9 : -.9, face > 0 ? Math.PI + .9 : .9); c.stroke();
    c.strokeStyle = `rgba(255,236,180,${0.7 * A})`; c.lineWidth = 2;
    c.beginPath(); c.moveTo(e.x, e.y + r); c.quadraticCurveTo(e.x + Math.sin(age * 7) * 7, e.y + r * 2.3, e.x - Math.sign(e.vx) * 5, e.y + r * 3.3); c.stroke();
    c.globalCompositeOperation = "lighter";
    if (age < 0.1) this.emit(e.x, e.y, e.pal[1], 20, 110, 1.4);
    if (Math.random() < 0.6 * A) this.emit(e.x, e.y + r, e.pal[2], 1, 20, 1.4, 1.2);
  }
  d_petals(c, e, age, dt) {
    const L = this.life(e, age, .6, 3), A = (0.25 + Math.min(1, e.amp * 2)) * L;
    e.rot += 0.2 * dt;
    for (let k = 0; k < e.n; k++) {
      const v = this.band(e, k % 8, 8), th = e.rot + (k / e.n) * TAU, len = 30 + v * 120 * A + age * 4;
      const tipx = e.x + Math.cos(th) * len, tipy = e.y + Math.sin(th) * len;
      const s1 = th + 0.5, s2 = th - 0.5, m = len * 0.55;
      c.beginPath(); c.moveTo(e.x, e.y);
      c.quadraticCurveTo(e.x + Math.cos(s1) * m, e.y + Math.sin(s1) * m, tipx, tipy);
      c.quadraticCurveTo(e.x + Math.cos(s2) * m, e.y + Math.sin(s2) * m, e.x, e.y);
      const col = e.pal[k % 3];
      c.fillStyle = rgba(col, 0.14 * A); c.fill(); c.strokeStyle = rgba(col, 0.55 * A); c.lineWidth = 1; c.stroke();
      if (e.onset) this.emit(tipx, tipy, col, 4, 50, 1.5);
    }
    this.glow(c, e.x, e.y, 30, e.pal[1], 0.5 * A);
  }
  d_vortex(c, e, age, dt) {
    const L = this.life(e, age, 1, 3), A = (0.3 + Math.min(1, e.amp * 2)) * L;
    e.rot += (0.6 + A) * dt;
    const n = Math.round(4 * A + (e.onset ? 16 : 0));
    for (let i = 0; i < n; i++) {
      const th = rnd(0, TAU), R = rnd(60, 180);
      const x = e.x + Math.cos(th) * R, y = e.y + Math.sin(th) * R * .45;
      const v = 70 + 120 * A;
      this.sparks.push({ x, y, vx: -Math.sin(th) * v - Math.cos(th) * 25, vy: (Math.cos(th) * v - Math.sin(th) * 25) * .45 - 30, age: 0, life: rnd(1, 2.2), col: e.pal[i % 3], size: 1.8 });
    }
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = rgba(e.pal[k], 0.35 * A); c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(e.x, e.y, 50 + k * 45 + e.amp * 40, (50 + k * 45) * .42, 0, e.rot * (k % 2 ? -1 : 1), e.rot * (k % 2 ? -1 : 1) + Math.PI * 1.3); c.stroke();
    }
    const g = c.createLinearGradient(e.x - 50, 0, e.x + 50, 0);
    g.addColorStop(0, rgba(e.pal[0], 0)); g.addColorStop(.5, rgba(e.pal[1], 0.22 * A)); g.addColorStop(1, rgba(e.pal[0], 0));
    c.fillStyle = g; c.fillRect(e.x - 50, 0, 100, e.y);
  }
  d_sunburst(c, e, age, dt) {
    const L = this.life(e, age, .05, 2.5), A = Math.min(1, e.amp * 2.2 + (age < .4 ? .6 : 0)) * L;
    e.rot += 0.1 * dt;
    const rays = 72;
    for (let i = 0; i < rays; i++) {
      const v = this.band(e, i % 18, 18), th = e.rot + (i / rays) * TAU;
      const r0 = 26 + age * 20, r1 = r0 + 30 + v * 240 * A;
      c.strokeStyle = rgba(i % 2 ? e.pal[0] : e.pal[1], 0.55 * A); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(e.x + Math.cos(th) * r0, e.y + Math.sin(th) * r0); c.lineTo(e.x + Math.cos(th) * r1, e.y + Math.sin(th) * r1); c.stroke();
    }
    this.glow(c, e.x, e.y, 90 + 120 * A, e.pal[0], 0.45 * A);
    if (age < 0.1 || e.onset) this.emit(e.x, e.y, e.pal[1], 40, 220, 2.4, 2);
  }
  d_stasis(c, e, age, dt) {   // Tempered Fate: a golden dial; the whole sky slows while it holds
    const L = this.life(e, age, 3, 3), A = (0.4 + Math.min(1, e.amp * 2)) * L;
    const R = 80 + 60 * L + e.amp * 30, col = [255, 214, 120];
    this.glow(c, e.x, e.y, R * 2, col, 0.3 * A);
    c.strokeStyle = rgba(col, 0.85 * A); c.lineWidth = 2.5; c.beginPath(); c.arc(e.x, e.y, R, 0, TAU); c.stroke();
    c.lineWidth = 1.2;
    for (let k = 0; k < 60; k++) {
      const v = this.band(e, k % 12, 12), th = (k / 60) * TAU + age * 0.05, l = (k % 5 ? 6 : 14) + v * 26;
      c.beginPath(); c.moveTo(e.x + Math.cos(th) * (R - l), e.y + Math.sin(th) * (R - l)); c.lineTo(e.x + Math.cos(th) * R, e.y + Math.sin(th) * R); c.stroke();
    }
    for (const [sp, len] of [[0.35, .75], [0.03, .5]]) {
      const h = age * sp * TAU / 6;
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x + Math.cos(h) * R * len, e.y + Math.sin(h) * R * len); c.stroke();
    }
    this.mandalaPath(c, e, e.x, e.y, R * .45, 12, age * 0.1, 6, 0);
    c.strokeStyle = rgba(col, 0.5 * A); c.stroke();
  }
  d_shrine(c, e, age, dt) {
    const L = this.life(e, age, .3, 3), A = (0.3 + Math.min(1, e.amp * 2)) * L, g = [190, 255, 180];
    this.glow(c, e.x, e.y, 80, g, 0.3 * A);
    c.strokeStyle = rgba(g, 0.7 * A); c.lineWidth = 1.5;
    for (const s of [1, 1.6]) {
      c.beginPath();
      for (let k = 0; k <= 6; k++) { const th = (k / 6) * TAU + Math.PI / 6 + age * .2 * s; const r = 24 * s * (1 + e.amp * .6); k ? c.lineTo(e.x + Math.cos(th) * r, e.y + Math.sin(th) * r) : c.moveTo(e.x + Math.cos(th) * r, e.y + Math.sin(th) * r); }
      c.stroke();
    }
    if (Math.random() < A) this.sparks.push({ x: e.x + rnd(-30, 30), y: e.y, vx: 0, vy: -rnd(40, 90), age: 0, life: 2, col: g, size: 1.6 });
  }
  d_swarm(c, e, age, dt) {
    const L = this.life(e, age, 3, 5), A = (0.3 + Math.min(1, e.amp * 2.5)) * L;
    e.seeds.forEach(([ph, rr, sp], i) => {
      const v = this.band(e, i % 10, 10), th = ph + age * sp * 0.6;
      const R = 20 + rr * 170 * (0.5 + v);
      this.glow(c, e.x + Math.cos(th) * R, e.y + Math.sin(th) * R * .6, 2.5 + v * 5, e.pal[i % 3], 0.9 * A);
    });
  }
  d_constellation(c, e, age, dt) {
    const L = this.life(e, age, 4, 6), A = (0.35 + Math.min(1, e.amp * 2)) * L;
    const shown = Math.min(e.pts.length, 1 + Math.floor(age / Math.max(1.5, (e.life - 8) / e.pts.length)));
    c.strokeStyle = rgba([255, 230, 180], 0.28 * A); c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < shown; i++) { c.moveTo(...e.pts[i - 1]); c.lineTo(e.pts[i][0], e.pts[i][1]); }
    c.stroke();
    for (let i = 0; i < shown; i++) {
      const [x, y, ph] = e.pts[i], v = this.band(e, i % 10, 10);
      this.glow(c, x, y, 6 + v * 26 * A, [255, 236, 190], (0.5 + 0.5 * Math.sin(age * 2 + ph)) * A);
      if (e.onset && Math.random() < .3) this.emit(x, y, [255, 225, 160], 6, 60, 1.5);
    }
  }
  d_shimmer(c, e, age) {
    const u = age / e.life, A = Math.sin(Math.PI * u), x = u * this.W * 1.2 - this.W * .1;
    if (Math.random() < .8) this.emit(x, e.y + rnd(-30, 30), e.pal[1], 3, 40, 1.5);
    this.glow(c, x, e.y, 60, e.pal[0], 0.3 * A);
  }
}
