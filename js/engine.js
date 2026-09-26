// Generative Bard soundscape engine (Web Audio).
// Scenes crossfade forever; each has a palette of skins, sound families and pitch set.
// A stretched "organ" bed breathes in and out underneath stochastic voices that mix and
// match Bard's sounds. Pitch shifts are octaves / fourths / fifths (Bard's G/D key family).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick1 = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const db2 = (g) => Math.pow(10, g / 20);
function wpick(items, weights) {
  let s = 0; for (const w of weights) s += w;
  let r = Math.random() * s;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

export const SCENES = [
  { id: "starfall", name: "Starfall", art: "default", skins: { Original: 1 },
    desc: "A stretched dawn of the login theme, lone chimes, the first meeps waking.",
    pads: [["theme", 0, 24, 1], ["theme", 24, 44, 1], ["theme", 44, 66, 1]],
    rates: { chime: 2.2, spawn: 1.4, cloud: .35, ceremony: .15, shrine: .25, meep: .25, theme_frag: .05 },
    pitch: [1, 1, 1, 2, .5], energy: [.15, .4] },
  { id: "meeps", name: "Meep Trails", art: "default", skins: { Original: 1, SnowDay: .35, Astronaut: .3, CafeCuties: .3 },
    desc: "Bard's walking melodies stacked in layers, meeps scattering everywhere.",
    pads: [["meeps", 0, 1], ["theme", 40, 62, 1], ["meeps", 1, 1]],
    rates: { meep: 1.7, spawn: 3.0, chime: 1.0, shrine: .4, cloud: .2, emote: .2 },
    pitch: [1, 1, 1, 2], energy: [.45, .7] },
  { id: "observatory", name: "Observatory", art: "astronaut", skins: { Astronaut: 1, Original: .3 },
    desc: "Astronaut Bard — zero-g chimes an octave up, granular starfields.",
    pads: [["theme", 60, 84, 1], ["theme", 70, 94, .5], ["snd", "Astronaut_RecallFX", 1]],
    rates: { chime: 2.4, cloud: .5, emote: .6, spawn: 1.4, ceremony: .3, theme_frag: .08, recall: .15, meep: .3 },
    pitch: [1, 1, 2, 2, 1.5], energy: [.5, .8] },
  { id: "cafe", name: "Café in the Clouds", art: "cafecuties", skins: { CafeCuties: 1, Original: .35 },
    desc: "Café Cuties — dance-loop fragments, laughs and jokes drifting between chimes.",
    pads: [["snd", "Original_DanceLoop", 1], ["theme", 84, 108, 1]],
    rates: { chime: 2.0, emote: 1.0, danceloop: .35, spawn: 2.0, meep: .4, cloud: .3, ceremony: .15 },
    pitch: [1, 1, 1, .5], energy: [.5, .8] },
  { id: "snow", name: "Snowfield", art: "snowday", skins: { SnowDay: 1, Original: .4 },
    desc: "Snow Day — slowed bells and falling-snow meep sparkles. The quiet hours.",
    pads: [["snd", "SnowDay_RecallFX", 1], ["theme", 120, 144, .5], ["meeps", 2, .75]],
    rates: { spawn: 1.8, recall: .4, chime: 1.2, cloud: .6, meep: .5, emote: .25, shrine: .2 },
    pitch: [.5, .75, 1, .5], energy: [.15, .35] },
  { id: "elderwood", name: "Elderwood Grove", art: "elderwood", skins: { Elderwood: 1, Original: .6 },
    desc: "Low roots: meep melodies a fourth down, far-off memories of the theme.",
    pads: [["snd", "Elderwood_RecallFX", 1], ["meeps", 3, .5], ["theme", 118, 140, .5]],
    rates: { recall: .3, emote: .5, meep: .8, chime: 1.0, theme_frag: .12, cloud: .4, shrine: .4 },
    pitch: [.75, 1, .5, 1], energy: [.3, .55] },
  { id: "fate", name: "Tempered Fate", art: "shanhai", skins: { Original: 1, Astronaut: .5, CafeCuties: .5, Client: .5 },
    desc: "Time freezes — stasis swells, chime cascades, upgrade ceremonies.",
    pads: [["snd", "Original_R_SFX_0", 1], ["snd", "Original_Passive_Chime_5_1", 1]],
    rates: { ult: .7, ceremony: .6, chime: 2.5, cloud: .8, cue: .3, spawn: .8 },
    pitch: [1, 2, .5, 1.5], energy: [.65, .9] },
  { id: "song", name: "The Caretaker's Song", art: "default", skins: { Original: 1, Astronaut: .3, CafeCuties: .3 },
    desc: "The login theme in full, then its echoes woven with meep melodies.",
    pads: [["theme", 140, 166, 1], ["theme", 0, 24, .5]],
    rates: { chime: .9, spawn: 1.0, meep: .5, theme_frag: .15, cloud: .3, ceremony: .1 },
    pitch: [1, 1, 2], energy: [.6, .85], theme: true },
  { id: "homeward", name: "Homeward", art: "spiritblossom",
    skins: { Original: 1, Astronaut: .6, CafeCuties: .6, SnowDay: .6, Elderwood: .6 },
    desc: "Every skin's recall and distant emotes — heading home.",
    pads: [["snd", "Original_Recall", 1], ["theme", 100, 124, .5], ["snd", "CafeCuties_RecallFX", 1]],
    rates: { recall: .8, emote: .6, chime: 1.2, spawn: 1.0, cloud: .3, meep: .4, danceloop: .2 },
    pitch: [1, 1, .75, .5], energy: [.35, .6] },
  { id: "beyond", name: "Beyond", art: "spiritblossom", skins: { Original: 1, Client: 1 },
    desc: "Everything dissolves into the stars.",
    pads: [["theme", 148, 168, 1], ["snd", "Original_Passive_Chime_UpgradeCeremony", .5]],
    rates: { chime: .9, spawn: .6, cloud: .4, ceremony: .1, meep: .2, cue: .25 },
    pitch: [.5, 1, .5], energy: [.1, .3] },
];
const SCENE = Object.fromEntries(SCENES.map(s => [s.id, s]));
const RAMP = 50;           // scene crossfade seconds
const DT = 0.25;           // scheduler resolution
const LOOKAHEAD = 2.5;     // seconds scheduled ahead

const BASE_DB = { chime: -9, spawn: -15, meep: -11, emote: -12, danceloop: -14, recall: -10, shrine: -11,
                  ceremony: -10, ult: -7, cue: -10, cloud: -15, theme_frag: -12 };

export class Engine {
  constructor(manifest, { onEvent = () => {}, onScene = () => {}, onProgress = () => {} } = {}) {
    this.clips = Object.fromEntries(manifest.clips.map(c => [c.name, c]));
    this.names = manifest.clips.map(c => c.name);
    this.onEvent = onEvent; this.onScene = onScene; this.onProgress = onProgress;
    this.buf = {}; this.rev = {}; this.used = new Set(); this.lastUsed = {};
    this.meepLayers = [0, 1, 2, 3].map(L => this.names.filter(n => n.startsWith(`Original_Move_Meep${L}_`))
      .sort((a, b) => +a.split("_").pop() - +b.split("_").pop()));
    this.oneShotChimes = this.names.filter(n => this.clips[n].cat === "chime" && !this.clips[n].loop);
    this.pending = new Map(); this.reqId = 0;
    this.freezes = [];
    this.paused = false;
  }

  // ------------------------------------------------------------ setup
  async start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = new AC({ latencyHint: "playback" });
    if (c.state === "suspended") await c.resume();
    this.sr = c.sampleRate;
    this.dry = c.createGain();
    this.wetIn = c.createGain();
    const conv = c.createConvolver(); conv.normalize = false; conv.buffer = this.makeIR(7, 0.035);
    const wetOut = c.createGain(); wetOut.gain.value = 0.85;
    const mix = c.createGain(); mix.gain.value = db2(9);
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 35; hp.Q.value = 0.6;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.08; comp.release.value = 1.0;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.3;
    this.volume = c.createGain(); this.volume.gain.value = 0.8;
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.82;
    this.dry.connect(mix); this.wetIn.connect(conv); conv.connect(wetOut); wetOut.connect(mix);
    mix.connect(hp); hp.connect(comp); comp.connect(lim); lim.connect(this.volume);
    this.volume.connect(this.analyser); this.analyser.connect(c.destination);
    // the organ bed has its own bus so it can breathe in and out
    this.padBed = c.createGain(); this.padBed.gain.value = 0.55;
    const padSend = c.createGain(); padSend.gain.value = 0.45;
    this.padBed.connect(this.dry); this.padBed.connect(padSend); padSend.connect(this.wetIn);

    this.worker = new Worker(new URL("./stretch-worker.js", import.meta.url));
    this.worker.onmessage = (e) => { const r = this.pending.get(e.data.id); if (r) { this.pending.delete(e.data.id); r(e.data.chans); } };

    // load the opening palette first, the rest in the background
    const core = this.names.filter(n => this.clips[n].skin === "Original" || n === "LoginTheme" || n === "Select" || n === "Select_SFX");
    let done = 0; const total = this.names.length;
    const load = async (n) => {
      try {
        const r = await fetch(this.clips[n].file); const ab = await r.arrayBuffer();
        this.buf[n] = await new Promise((res, rej) => c.decodeAudioData(ab, res, rej));
      } catch (err) { console.warn("failed to load", n, err); }
      this.onProgress(++done / total);
    };
    await pool(core, 8, load);
    this.rest = pool(this.names.filter(n => !core.includes(n)), 4, load);
    this.makeFreezes();

    // clock + state
    this.t0 = c.currentTime + 0.3;
    this.schedT = this.t0;
    this.e = 0.2; this.eTarget = 0.3;
    this.nextOk = {}; this.lastFg = this.t0; this.duckUntil = 0; this.duckFrom = 0;
    this.lastTheme = -1e9; this.sceneHistory = [];
    this.entries = []; this.addScene("starfall", this.t0, rnd(4, 6) * 60);
    this.bed = { from: 0.55, to: 1, at: this.t0, next: this.t0 + rnd(90, 150), up: true };
    this.rampBed(this.t0, 1);
    this.pads = [{ next: this.t0, busy: false, last: null }, { next: this.t0 + 55, busy: false, last: null }];
    this.recentPads = [];
    this.clouds = [];
    this.voice("Select_SFX", this.t0 + 2, { db: -11, lp: 6000, fadeIn: .4, fadeOut: .5, send: .85, cat: "cue" });
    this.voice("Select", this.t0 + 8, { db: -9, pan: .1, fadeIn: .05, fadeOut: .5, send: .6, cat: "cue" });
    this.timer = setInterval(() => this.pump(), 200);
    this.pump();
  }

  setVolume(v) { if (this.volume) this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  async togglePause() {
    if (!this.ctx) return;
    if (this.ctx.state === "running") { await this.ctx.suspend(); this.paused = true; }
    else { await this.ctx.resume(); this.paused = false; }
    return this.paused;
  }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  makeIR(secs, pre) {
    const c = this.ctx, n = Math.floor(secs * this.sr), p = Math.floor(pre * this.sr);
    const ir = c.createBuffer(2, n + p, this.sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lo = 0, y = 0, en = 0;
      for (let i = 0; i < n; i++) {
        const t = i / this.sr, w = Math.random() * 2 - 1;
        const a = 0.9 * Math.exp(-t / 1.6) + 0.05;          // tail darkens over time
        y += a * (w - y); lo += 0.02 * (w - lo);
        const v = (y - lo * 0.9) * Math.exp((-6.9 * t) / 5.2) + lo * 1.5 * Math.exp((-6.9 * t) / 6.0);
        d[i + p] = v; en += v * v;
      }
      const g = 1 / Math.sqrt(en); for (let i = 0; i < d.length; i++) d[i] *= g;
    }
    return ir;
  }

  stretch(chans, opts) {
    return new Promise(res => {
      const id = ++this.reqId; this.pending.set(id, res);
      this.worker.postMessage({ id, chans, sr: this.sr, ...opts }, chans.map(c => c.buffer));
    });
  }
  chansOf(b, a = 0, z = b.duration) {
    const i0 = Math.floor(a * b.sampleRate), i1 = Math.floor(Math.min(z, b.duration) * b.sampleRate);
    const out = []; for (let ch = 0; ch < 2; ch++) out.push(b.getChannelData(Math.min(ch, b.numberOfChannels - 1)).slice(i0, i1));
    return out;
  }
  toBuffer(chans) {
    const b = this.ctx.createBuffer(2, chans[0].length, this.sr);
    b.copyToChannel(chans[0], 0); b.copyToChannel(chans[1], 1); return b;
  }
  async makeFreezes() {
    const r = this.buf["Original_R_SFX_0"]; if (!r) return;
    for (let k = 0; k < 2; k++) {
      const ch = await this.stretch(this.chansOf(r), { stretch: rnd(5, 8), maxDur: 30, trim: true });
      this.freezes.push(this.toBuffer(ch));
    }
  }
  reversed(n) {
    if (!this.rev[n]) {
      const b = this.buf[n], r = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
      for (let ch = 0; ch < b.numberOfChannels; ch++) r.copyToChannel(b.getChannelData(ch).slice().reverse(), ch);
      this.rev[n] = r;
    }
    return this.rev[n];
  }

  // ------------------------------------------------------------ playback primitives
  out(node, send, dest) {
    node.connect(dest || this.dry);
    if (send > 0 && !dest) { const s = this.ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(this.wetIn); return s; }
    return null;
  }
  // Plays a clip (or a raw AudioBuffer via o.buffer). Returns its duration in seconds.
  voice(name, when, o = {}) {
    const b = o.buffer || this.buf[name]; if (!b) return 0;
    const c = this.ctx, rate = o.rate || 1;
    let offset = o.offset || 0, dur = o.duration ?? (b.duration - offset) / rate;
    const late = c.currentTime + 0.02 - when;          // scheduled in the past: skip ahead, keep the envelope aligned
    if (late > 0) { offset += late * rate; dur -= late; when += late; o = { ...o, fadeIn: Math.max(0.004, (o.fadeIn ?? 0) - late) }; }
    if (dur <= 0.02) return 0;
    const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const nodes = [src]; let node = src;
    const filt = (type, f) => { const q = c.createBiquadFilter(); q.type = type; q.frequency.value = f; q.Q.value = 0.5; node.connect(q); node = q; nodes.push(q); };
    if (o.lp) filt("lowpass", o.lp);
    if (o.hp) filt("highpass", o.hp);
    const g = c.createGain(); node.connect(g); nodes.push(g);
    const lvl = db2((o.db || 0) + (o.buffer ? 0 : (this.clips[name]?.norm || 0)));
    env(g.gain, when, dur, lvl, o.fadeIn ?? 0.004, o.fadeOut ?? 0.05);
    const p = c.createStereoPanner(); p.pan.value = clamp(o.pan || 0, -1, 1); g.connect(p); nodes.push(p);
    const s = this.out(p, o.send ?? 0.4, o.dest); if (s) nodes.push(s);
    let an = o.tap || null;
    if (!an && o.event !== false && name) { an = this.tap(); nodes.push(an); }
    if (an) p.connect(an);
    src.start(when, offset, dur * rate);
    src.stop(when + dur + 0.1);
    src.onended = () => nodes.forEach(n => n.disconnect());
    if (!o.silent && name) this.mark(name, when, o);
    if (o.event !== false && name) this.emit({ name, cat: o.cat || this.clips[name]?.cat, skin: this.clips[name]?.skin, when, dur, pan: o.pan || 0, rate, kind: o.kind, an });
    return dur;
  }
  // Loop material (clips cut from the middle of a sustained hum): crossfade-loop, breathe in and out.
  loopDrift(name, when, dur, o = {}) {
    const b = this.buf[name]; if (!b) return 0;
    const c = this.ctx, rate = o.rate || 1, seg = b.duration / rate, xf = Math.min(1.5, seg / 3);
    const bus = c.createGain(); const nodes = [bus];
    env(bus.gain, when, dur, db2((o.db || 0) + this.clips[name].norm), o.fadeIn || 5, o.fadeOut || 8);
    let node = bus;
    if (o.lp) { const q = c.createBiquadFilter(); q.type = "lowpass"; q.frequency.value = o.lp; bus.connect(q); node = q; nodes.push(q); }
    if (o.hp) { const q = c.createBiquadFilter(); q.type = "highpass"; q.frequency.value = o.hp; node.connect(q); node = q; nodes.push(q); }
    const p = c.createStereoPanner(); p.pan.value = clamp(o.pan || 0, -1, 1); node.connect(p); nodes.push(p);
    const s = this.out(p, o.send ?? 0.6); if (s) nodes.push(s);
    const an = this.tap(); p.connect(an); nodes.push(an);
    const up = new Float32Array(32).map((_, i) => Math.sin((i / 31) * Math.PI / 2));
    const down = up.slice().reverse();
    let t = when, live = 0;
    while (t < when + dur) {
      const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
      const g = c.createGain(); src.connect(g); g.connect(bus);
      g.gain.setValueAtTime(t === when ? 1 : 0, Math.max(t, c.currentTime));
      if (t !== when) g.gain.setValueCurveAtTime(up, t, xf);
      g.gain.setValueCurveAtTime(down, t + seg - xf, xf);
      src.start(t); src.stop(t + seg + 0.05); live++;
      src.onended = () => { src.disconnect(); g.disconnect(); if (--live === 0) setTimeout(() => nodes.forEach(n => n.disconnect()), 100); };
      t += seg - xf;
    }
    this.mark(name, when, o);
    this.emit({ name, cat: "chime", skin: this.clips[name].skin, when, dur, pan: o.pan || 0, rate, kind: "drift", an });
    return dur;
  }

  tap() { const a = this.ctx.createAnalyser(); a.fftSize = 256; a.smoothingTimeConstant = 0.55; return a; }
  mark(name, when) { this.used.add(name); this.lastUsed[name] = when; }
  emit(ev) { this.onEvent(ev); }

  // ------------------------------------------------------------ scenes, energy, bed
  addScene(id, a, len) {
    this.entries.push({ sc: SCENE[id], a, b: a + len });
    this.sceneHistory.push(id);
    const sc = SCENE[id];
    if (sc.theme) { this.themeAt = a + 20; this.themePlanned = true; }
    this.eTarget = rnd(...sc.energy);
  }
  nextSceneId(t) {
    const recent = this.sceneHistory.slice(-3);
    const ids = SCENES.map(s => s.id).filter(id => !recent.includes(id));
    const w = ids.map(id => {
      if (id === "song") return (t - this.lastTheme > 30 * 60 && t - this.t0 > 12 * 60) ? 3 : 0;
      if (id === "starfall") return 0.5;
      if (id === "beyond") return 0.6;
      return 1;
    });
    return wpick(ids, w);
  }
  weights(t) {
    return this.entries.map(en => clamp(Math.min((t - en.a + RAMP / 2) / RAMP, (en.b + RAMP / 2 - t) / RAMP), 0, 1));
  }
  dominant(t) { const w = this.weights(t); let bi = 0; w.forEach((x, i) => { if (x > w[bi]) bi = i; }); return this.entries[bi].sc; }
  rampBed(t, target) {
    const g = this.padBed.gain;
    g.setValueAtTime(this.bedValue(t), t); g.linearRampToValueAtTime(target, t + 25);
    this.bed.from = this.bedValue(t); this.bed.to = target; this.bed.at = t;
  }
  bedValue(t) {
    if (!this.bed) return 0.55;
    const u = clamp((t - this.bed.at) / 25, 0, 1);
    return this.bed.from + (this.bed.to - this.bed.from) * u;
  }
  duck(t) { return (t > this.duckFrom + 5 && t < this.duckUntil - 5) ? 0.3 : 1; }

  // ------------------------------------------------------------ main loop
  pump() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.schedT < horizon) { this.tick(this.schedT); this.schedT += DT; }
    this.padLoop();
  }

  tick(t) {
    // scene bookkeeping
    const last = this.entries[this.entries.length - 1];
    if (t > last.b - RAMP) this.addScene(this.nextSceneId(t), last.b, rnd(4, 7) * 60);
    this.entries = this.entries.filter(en => en.b + RAMP > t);
    const dom = this.dominant(t);
    if (dom !== this.curScene) { this.curScene = dom; this.onScene(dom, t); }
    // full login theme
    if (this.themePlanned && t >= this.themeAt) {
      this.themePlanned = false; this.lastTheme = t;
      const d = this.voice("LoginTheme", t, { db: -4, send: .25, fadeIn: 6, fadeOut: 6, cat: "theme", kind: "full" });
      this.duckFrom = t; this.duckUntil = t + d;
    }
    // energy: slow glide to the scene's target + gentle wobble
    this.e += (this.eTarget - this.e) * DT / 60;
    if (Math.random() < DT / 90) this.eTarget = rnd(...dom.energy);
    const e = clamp(this.e + 0.05 * Math.sin(t / 97) + 0.04 * Math.sin(t / 41 + 1), 0, 1);
    this.energy = e;
    // organ bed breathing: in for 1.5-3.5 min, away for 1-2.5 min
    if (t >= this.bed.next) {
      this.bed.up = !this.bed.up;
      this.rampBed(t, this.bed.up ? 1 : rnd(0.1, 0.25));
      this.bed.next = t + (this.bed.up ? rnd(90, 210) : rnd(60, 150));
    }
    const bed = this.bedValue(t);
    // grain clouds in progress
    this.cloudTick(t);
    // voices
    const w = this.weights(t);
    for (const cat of Object.keys(BASE_DB)) {
      if (t < (this.nextOk[cat] || 0)) continue;
      const rates = this.entries.map((en, i) => (en.sc.rates[cat] || 0) * w[i]);
      const sum = rates.reduce((a, b) => a + b, 0);
      if (sum <= 0) continue;
      const rate = sum * 1.5 * (0.6 + 1.1 * e) * this.duck(t) * (1 + 0.9 * (1 - bed));
      const overdue = t - this.lastFg > 14 && this.duck(t) === 1 && ["chime", "spawn", "meep", "cloud", "emote"].includes(cat);
      if (!overdue && Math.random() > (rate / 60) * DT) continue;
      const sc = wpick(this.entries, rates).sc;
      const busy = this[`v_${cat}`](t, sc, e, BASE_DB[cat] + 5 * (e - 0.5)) || 1;
      this.nextOk[cat] = t + Math.max(busy, 60 / (rate * 3));
      this.lastFg = t;
    }
  }

  // ------------------------------------------------------------ pad bed (two interleaved voices)
  padLoop() {
    const now = this.ctx.currentTime;
    for (const v of this.pads) {
      if (v.busy || v.next - now > 20) continue;
      v.busy = true;
      const t = Math.max(v.next, now + 0.5);
      const sc = this.dominant(t + 40);
      let specs = sc.pads.filter(s => !this.recentPads.slice(-3).some(r => r.join() === s.join()));
      if (!specs.length) specs = sc.pads.filter(s => s.join() !== (v.last || []).join());
      if (!specs.length) specs = sc.pads;
      const spec = pick1(specs); v.last = spec; this.recentPads.push(spec);
      const dur = rnd(80, 140);
      const src = this.padSource(spec);
      if (!src) { v.busy = false; v.next = t + 10; continue; }
      const srcDur = src[0].length / this.sr / spec[spec.length - 1];
      this.stretch(src, { stretch: Math.max(2, 1.5 * dur / Math.max(srcDur, 0.5)), rate: spec[spec.length - 1], trim: true, maxDur: dur })
        .then(ch => {
          const when = Math.max(t, this.ctx.currentTime + 0.2);
          this.playPad(this.toBuffer(ch), when, spec);
          v.next = when + ch[0].length / this.sr - 38; v.busy = false;
        });
    }
  }
  padSource(spec) {
    if (spec[0] === "theme") { const b = this.buf.LoginTheme; return b && this.chansOf(b, spec[1], spec[2]); }
    if (spec[0] === "snd") { const b = this.buf[spec[1]]; return b && this.chansOf(b); }
    const names = this.meepLayers[spec[1]].slice(0, 6).filter(n => this.buf[n]);
    if (!names.length) return null;
    const parts = names.map(n => this.chansOf(this.buf[n]));
    return [0, 1].map(ch => { const len = parts.reduce((a, p) => a + p[ch].length, 0), y = new Float32Array(len); let o = 0; for (const p of parts) { y.set(p[ch], o); o += p[ch].length; } return y; });
  }
  playPad(buffer, when, spec) {
    const c = this.ctx, dur = buffer.duration, e = this.energy ?? 0.4;
    const lvl = db2(-14 + 3 * (0.5 - e));
    const mk = (rate, lpLo, lpHi, extraDb, hpF) => {
      const src = c.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.4;
      // slow tone sweep, 40-90 s period
      const per = rnd(40, 90), ph = Math.random() * 6.28, n = 256, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = lpLo + (lpHi - lpLo) * (0.5 + 0.5 * Math.sin((2 * Math.PI * (i / (n - 1)) * dur) / per + ph));
      f.frequency.setValueCurveAtTime(curve, when, dur);
      const g = c.createGain(); env(g.gain, when, dur, lvl * db2(extraDb), 30, 35);
      src.connect(f); let node = f;
      if (hpF) { const h = c.createBiquadFilter(); h.type = "highpass"; h.frequency.value = hpF; f.connect(h); node = h; }
      node.connect(g); g.connect(this.padBed);
      src.start(when); src.stop(when + dur + 0.1);
      src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    };
    mk(1, 600, 1500 + 7000 * e, 0);
    if (e < 0.4 && Math.random() < 0.5) mk(0.5, 300, 700, -7, 45);   // low organ shadow
    this.emit({ name: spec.join(" "), cat: "pad", when, dur, pan: 0, rate: 1 });
  }

  // ------------------------------------------------------------ choosing
  pick(cat, sc, t, pool) {
    const cands = (pool || this.names.filter(n => this.clips[n].cat === cat)).filter(n => this.buf[n]);
    if (!cands.length) return null;
    const w = cands.map(n => {
      let x = sc.skins[this.clips[n].skin] ?? 0.05;
      if (!this.used.has(n)) x *= 4;
      if (t - (this.lastUsed[n] ?? -1e9) < 120) x *= 0.05;
      return x;
    });
    return wpick(cands, w);
  }
  pan(w = 0.8) { return rnd(-w, w); }

  echoTrail(name, t, db, pan, o = {}) {
    const d = pick1([0.375, 0.5, 0.75, 1.0]), fb = rnd(0.35, 0.55);
    for (let k = 1; k <= 4; k++)
      this.voice(name, t + k * d, { ...o, db: db + 20 * Math.log10(fb ** k), pan: k % 2 ? -pan : pan, lp: 5200 - 900 * k, send: .6, silent: true, event: false });
  }

  // ------------------------------------------------------------ voices
  v_chime(t, sc, e, db) {
    const n = this.pick("chime", sc, t); if (!n) return 2;
    const r = pick1(sc.pitch), p = this.pan();
    const o = { rate: r, hp: r >= 2 ? 500 : 0, lp: r <= .5 ? 3000 : 0 };
    if (this.clips[n].loop) return this.loopDrift(n, t, rnd(16, 35), { ...o, db: db - 2, pan: p, fadeIn: rnd(4, 7), fadeOut: rnd(6, 10), send: rnd(.5, .75) }) * 0.4;
    if (Math.random() < 0.12) {           // reverse swell landing on the chime
      const rb = this.reversed(n), len = Math.min(4, rb.duration / r);
      this.voice(null, t - len, { buffer: rb, offset: rb.duration - len * r, duration: len, rate: r, db: db - 4 + this.clips[n].norm, lp: 4000, pan: -p, fadeIn: 2.5, fadeOut: .05, send: .8, event: false });
    }
    this.voice(n, t, { ...o, db, pan: p, fadeIn: .01, fadeOut: .5, send: rnd(.45, .75), kind: "hit" });
    if (Math.random() < 0.25) this.echoTrail(n, t, db - 4, p, o);
    if (Math.random() < 0.3) {            // call and response from the same skin
      const skin = this.clips[n].skin;
      let pool = this.oneShotChimes.filter(m => this.clips[m].skin === skin && m !== n);
      if (!pool.length) pool = this.oneShotChimes.filter(m => m !== n);
      const m = this.pick("chime", sc, t, pool);
      if (m) this.voice(m, t + rnd(3, 7), { rate: r, db: db - 2, pan: -p, fadeIn: .01, fadeOut: .5, send: .6, kind: "hit" });
    }
    return 2;
  }
  v_spawn(t, sc, e, db) {
    const n = this.pick("spawn", sc, t); if (!n) return 1;
    const r = pick1([1, 1, 1, .5, 2]), p = this.pan(.95);
    this.voice(n, t, { rate: r, db, pan: p, lp: 7000, send: .55 });
    if (Math.random() < 0.4) this.echoTrail(n, t, db - 3, p, { rate: r });
    return 0.8;
  }
  v_meep(t, sc, e, db) {
    const pitches = sc.pitch.filter(x => x <= 1); const r = pitches.length ? pick1(pitches) : 1;
    const layers = [wpick([0, 1, 2, 3], [.35, .25, .2, .2])];
    if (e > 0.5 && Math.random() < 0.5) layers.push(pick1([0, 1, 2, 3].filter(l => l !== layers[0])));
    const k = 2 + Math.floor(Math.random() * 4); let span = 0;
    layers.forEach((L, j) => {
      const names = this.meepLayers[L].filter(n => this.buf[n]); if (!names.length) return;
      let i0 = Math.floor(Math.random() * names.length);
      const fresh = names.map((n, i) => this.used.has(n) ? -1 : i).filter(i => i >= 0);
      if (fresh.length && Math.random() < .7) i0 = pick1(fresh);
      let tt = t; const p = (j === 0 ? -0.35 : 0.4) + rnd(-.2, .2);
      for (let q = 0; q < k; q++) {
        const n = names[(i0 + q) % names.length];
        const d = this.voice(n, tt, { rate: r, db: db - 2 * j, pan: p, fadeIn: .02, fadeOut: .7, send: .45, kind: `layer${L}` });
        tt += d * 0.82;
      }
      span = Math.max(span, tt - t);
    });
    return span;
  }
  v_emote(t, sc, e, db) {
    const n = this.pick("emote", sc, t); if (!n) return 3;
    const r = Math.min(...sc.pitch) < 1 ? pick1([1, 1, .75]) : 1, p = this.pan();
    const distant = Math.random() < .5;
    const d = this.voice(n, t, { rate: r, db, pan: p, lp: distant ? rnd(1200, 3000) : 0, fadeIn: .05, fadeOut: 1, send: .65 });
    if (Math.random() < .35) {
      const pool = this.oneShotChimes.filter(m => this.clips[m].skin === this.clips[n].skin);
      const m = pool.length && this.pick("chime", sc, t, pool);
      if (m) this.voice(m, t + 1.5, { db: db - 3, pan: -p, fadeIn: .01, fadeOut: .5, send: .6, kind: "hit" });
    }
    return d * 0.6;
  }
  v_danceloop(t, sc, e, db) {
    const n = "Original_DanceLoop", b = this.buf[n]; if (!b) return 5;
    const reps = 2 + Math.floor(Math.random() * 3), cut = rnd(1200, 5000), p = this.pan(.3);
    for (let i = 0; i < reps; i++)
      this.voice(n, t + i * b.duration, { db, pan: p, lp: cut, send: .5, fadeIn: i === 0 ? 2 : 0.004, fadeOut: i === reps - 1 ? 3 : 0.004, event: i === 0, silent: i > 0 });
    return reps * b.duration;
  }
  v_recall(t, sc, e, db) {
    const n = this.pick("recall", sc, t); if (!n) return 5;
    const p = this.pan(.5);
    const d = this.voice(n, t, { db, pan: p, fadeIn: .05, fadeOut: 1, send: .6 });
    if (Math.random() < .35) {
      const b = this.buf[n];
      this.stretch(this.chansOf(b, 0, Math.min(6, b.duration)), { stretch: 5, maxDur: 30 }).then(ch => {
        const when = t + 4; if (when < this.ctx.currentTime + 0.1) return;
        this.voice(null, when, { buffer: this.toBuffer(ch), db: db - 6, lp: 3500, pan: -p, fadeIn: 6, fadeOut: 10, send: .6, event: false });
      });
    }
    return d;
  }
  v_shrine(t, sc, e, db) {
    const n = this.pick("shrine", sc, t); if (!n) return 3;
    const p = this.pan(.6);
    this.voice(n, t, { db, pan: p, send: .7 }); this.echoTrail(n, t, db - 4, p);
    return 3;
  }
  v_ceremony(t, sc, e, db) {
    const n = this.pick("ceremony", sc, t); if (!n) return 6;
    this.voice(n, t, { db, pan: this.pan(.4), fadeIn: .01, fadeOut: .8, send: .7 });
    if (Math.random() < .4) this.voice(n, t, { rate: .5, db: db - 5, lp: 2500, fadeIn: .5, fadeOut: 2, send: .7, silent: true, event: false });
    return 6;
  }
  v_ult(t, sc, e, db) {
    const n = "Original_R_SFX_0"; if (!this.buf[n] || !this.freezes.length) return 5;
    const fz = pick1(this.freezes);
    const an = this.tap();
    this.voice(null, t, { buffer: fz, db: db - 3 + this.clips[n].norm, lp: 4000, fadeIn: 6, fadeOut: 4, send: .7, event: false, tap: an });
    setTimeout(() => an.disconnect(), (t - this.ctx.currentTime + fz.duration + 1) * 1000);
    const hit = t + fz.duration * 0.55;
    this.voice(n, hit, { db, pan: this.pan(.3), send: .8 });
    this.emit({ name: n, cat: "ult", kind: "freeze", when: t, dur: fz.duration, pan: 0, rate: 1, an });
    return fz.duration;
  }
  v_cue(t, sc, e, db) {
    const n = this.pick("cue", sc, t, sc.id === "beyond" ? ["Ban", "Select_SFX"] : ["Select_SFX", "Select"]); if (!n) return 10;
    this.voice(n, t, { db, pan: this.pan(.3), lp: 6000, fadeIn: .3, fadeOut: .5, send: .85 });
    return 10;
  }
  v_theme_frag(t, sc, e, db) {
    const b = this.buf.LoginTheme; if (!b) return 10;
    const a = rnd(0, b.duration - 40), d = rnd(12, 32), r = pick1([1, 1, .5]);
    return this.voice("LoginTheme", t, { offset: a, duration: d / r, rate: r, db, lp: rnd(1500, 4000), pan: this.pan(.3), fadeIn: 4, fadeOut: 6, send: .7, cat: "theme_frag", silent: true });
  }
  v_cloud(t, sc, e, db) {
    const pool = this.names.filter(n => ["chime", "spawn", "meep", "ceremony", "recall"].includes(this.clips[n].cat) && (sc.skins[this.clips[n].skin] || 0) > 0);
    const n = this.pick("x", sc, t, pool); if (!n) return 10;
    const b = this.buf[n], ch = b.getChannelData(0);
    let peak = 0; for (let i = 0; i < ch.length; i += 64) peak = Math.max(peak, Math.abs(ch[i]));
    const active = []; for (let i = 0; i < ch.length; i += 512) if (Math.abs(ch[i]) > peak * 0.1) active.push(i / b.sampleRate);
    if (!active.length) return 5;
    const dur = rnd(12, 30), dens = 4 + 16 * e;
    const bus = this.ctx.createGain(); env(bus.gain, t, dur, 1, 3, 5);
    const h = this.ctx.createBiquadFilter(); h.type = "highpass"; h.frequency.value = 150; bus.connect(h);
    const s = this.out(h, .8); const an = this.tap(); h.connect(an);
    this.clouds.push({ n, b, active, a: t, z: t + dur, dens, pitch: [...sc.pitch, 2, .5], bus, h, s, an,
                       lvl: db2(db + this.clips[n].norm) / Math.sqrt(Math.max(1, dens * 0.2)) });
    this.mark(n, t);
    this.emit({ name: n, cat: "cloud", skin: this.clips[n].skin, when: t, dur, pan: 0, rate: 1, an });
    return dur * 0.6;
  }
  cloudTick(t) {
    const c = this.ctx;
    this.clouds = this.clouds.filter(cl => {
      if (t > cl.z) { setTimeout(() => { cl.bus.disconnect(); cl.h.disconnect(); cl.s && cl.s.disconnect(); cl.an.disconnect(); }, (cl.z - c.currentTime + 2) * 1000); return false; }
      const u = (t - cl.a) / (cl.z - cl.a), shape = Math.sin(Math.PI * clamp(u, 0, 1)) * 1.4;
      let n = poisson(cl.dens * DT * shape);
      while (n-- > 0) {
        const when = t + Math.random() * DT, gl = rnd(0.08, 0.35), r = pick1(cl.pitch);
        const off = pick1(cl.active); if (off + gl * r > cl.b.duration) continue;
        const src = c.createBufferSource(); src.buffer = cl.b; src.playbackRate.value = r;
        const g = c.createGain(); g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(cl.lvl, when + gl / 2); g.gain.linearRampToValueAtTime(0, when + gl);
        const p = c.createStereoPanner(); p.pan.value = rnd(-1, 1);
        src.connect(g); g.connect(p); p.connect(cl.bus);
        src.start(when, off, gl * r); src.stop(when + gl + 0.02);
        src.onended = () => { src.disconnect(); g.disconnect(); p.disconnect(); };
      }
      return true;
    });
  }
}

function env(param, when, dur, lvl, fin, fout) {
  fin = Math.max(0.004, Math.min(fin, dur / 2)); fout = Math.max(0.004, Math.min(fout, dur / 2));
  param.setValueAtTime(0, when);
  param.linearRampToValueAtTime(lvl, when + fin);
  param.setValueAtTime(lvl, when + dur - fout);
  param.linearRampToValueAtTime(0, when + dur);
}
function poisson(l) { let k = 0, p = Math.exp(-l), s = p, u = Math.random(); while (u > s && k < 50) { k++; p *= l / k; s += p; } return k; }
async function pool(items, n, fn) {
  const q = items.slice(); const run = async () => { while (q.length) await fn(q.shift()); };
  await Promise.all(Array.from({ length: n }, run));
}
