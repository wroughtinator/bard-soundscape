// PaulStretch in a worker: turns a few seconds of Bard audio into a long, slowly
// shifting pad. Random phases per channel give a wide, never-identical texture.

const N = 32768, HOP = N / 2;
const WIN = new Float32Array(N);
for (let i = 0; i < N; i++) { const x = -1 + (2 * i) / (N - 1); WIN[i] = Math.pow(1 - x * x, 1.25); }

// iterative radix-2 FFT (in place)
const LOG = Math.log2(N), REV = new Uint32Array(N), COS = new Float32Array(N / 2), SIN = new Float32Array(N / 2);
for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b); REV[i] = r; }
for (let i = 0; i < N / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / N); SIN[i] = -Math.sin((2 * Math.PI * i) / N); }
function fft(re, im) {
  for (let i = 0; i < N; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let s = 0; s < N; s += size) {
      for (let k = 0; k < half; k++) {
        const wr = COS[k * step], wi = SIN[k * step], a = s + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

function resample(x, rate) {
  if (rate === 1) return x;
  const n = Math.floor(x.length / rate), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * rate, j = p | 0, f = p - j; y[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f; }
  return y;
}

function trimSilence(chs, sr) {
  const blk = Math.floor(sr / 10), n = Math.floor(chs[0].length / blk);
  let peak = 0; for (const c of chs) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  const keep = [];
  for (let b = 0; b < n; b++) {
    let m = 0; for (const c of chs) for (let i = b * blk; i < (b + 1) * blk; i++) m = Math.max(m, Math.abs(c[i]));
    if (m > peak * 0.08) keep.push(b);
  }
  if (!keep.length) return chs;
  return chs.map(c => { const y = new Float32Array(keep.length * blk); keep.forEach((b, k) => y.set(c.subarray(b * blk, (b + 1) * blk), k * blk)); return y; });
}

self.onmessage = (e) => {
  const { id, chans, sr, stretch, rate = 1, trim = false, maxDur } = e.data;
  let chs = chans.map(c => resample(new Float32Array(c), rate));
  if (trim) chs = trimSilence(chs, sr);
  const inLen = chs[0].length;
  const padded = chs.map(c => { const y = new Float32Array(inLen + N); y.set(c); return y; });
  const outLen = Math.min(Math.floor((inLen + N) * stretch), Math.floor(maxDur * sr));
  const out = chs.map(() => new Float32Array(outLen + N));
  const re = new Float32Array(N), im = new Float32Array(N);
  let pos = 0, o = 0;
  while (o < outLen) {
    const p = pos | 0;
    if (p + N > padded[0].length) break;
    for (let c = 0; c < chs.length; c++) {
      const x = padded[c];
      for (let i = 0; i < N; i++) { re[i] = x[p + i] * WIN[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= N / 2; k++) {
        const mag = Math.hypot(re[k], im[k]), ph = Math.random() * 2 * Math.PI;
        re[k] = mag * Math.cos(ph); im[k] = mag * Math.sin(ph);
        if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      }
      im[0] = 0; im[N / 2] = 0;
      for (let i = 0; i < N; i++) im[i] = -im[i];        // inverse via conjugate
      fft(re, im);
      const y = out[c];
      for (let i = 0; i < N; i++) y[o + i] += (re[i] / N) * WIN[i];
    }
    o += HOP; pos += HOP / stretch;
  }
  let ss = 0, cnt = 0;
  const res = out.map(c => c.subarray(0, o).slice());
  for (const c of res) for (let i = 0; i < c.length; i += 7) { ss += c[i] * c[i]; cnt++; }
  const g = 0.1 / (Math.sqrt(ss / Math.max(cnt, 1)) + 1e-9);
  for (const c of res) for (let i = 0; i < c.length; i++) c[i] *= g;
  self.postMessage({ id, chans: res }, res.map(c => c.buffer));
};
