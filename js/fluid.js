// GPU stable-fluids simulation (WebGL2, falling back to WebGL1 + half-float).
// Fixed cost per frame: the grid resolutions and solver iterations never change with
// activity, and splats go through a queue capped per frame. Algorithm after Jos Stam's
// "Stable Fluids" as popularised by Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).

const VS = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float; precision highp sampler2D;
#else
precision mediump float; precision mediump sampler2D;
#endif
varying vec2 vUv, vL, vR, vT, vB;
`;
const FS = {
  clear: `uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
  splat: `uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () { vec2 p = vUv - point.xy; p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0); }`,
  advection: `uniform sampler2D uVelocity, uSource; uniform vec2 texelSize, dyeTexelSize; uniform float dt, dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize), b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize), d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y); }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      gl_FragColor = result / (1.0 + dissipation * dt); }`,
  divergence: `uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x, T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }`,
  curl: `uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y, T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0); }`,
  vorticity: `uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
    void main () {
      float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x, T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x, C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001; force *= curl * C; force.y *= -1.0;
      vec2 v = texture2D(uVelocity, vUv).xy + force * dt;
      v = min(max(v, -1000.0), 1000.0);
      gl_FragColor = vec4(v, 0.0, 1.0); }`,
  viscous: `uniform sampler2D uVelocity; uniform float amount;
    void main () {
      vec2 C = texture2D(uVelocity, vUv).xy;
      vec2 avg = 0.25 * (texture2D(uVelocity, vL).xy + texture2D(uVelocity, vR).xy + texture2D(uVelocity, vT).xy + texture2D(uVelocity, vB).xy);
      gl_FragColor = vec4(mix(C, avg, amount), 0.0, 1.0); }`,
  pressure: `uniform sampler2D uPressure, uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
      float d = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0); }`,
  gradient: `uniform sampler2D uPressure, uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
      vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
      gl_FragColor = vec4(v, 0.0, 1.0); }`,
  // "heavenly soup": a luminous liquid with defined edges, glossy highlights, a pearlescent
  // sheen that shifts with thickness, and a soft halo. Premultiplied alpha over the art.
  display: `uniform sampler2D uTexture; uniform vec2 texelSize; uniform float time;
    float thick (vec3 c) { return dot(c, vec3(0.35, 0.4, 0.25)); }
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      float h = thick(c);
      vec2 o = texelSize * 2.5;
      float hl = thick(texture2D(uTexture, vUv - vec2(o.x, 0.0)).rgb), hr = thick(texture2D(uTexture, vUv + vec2(o.x, 0.0)).rgb);
      float ht = thick(texture2D(uTexture, vUv + vec2(0.0, o.y)).rgb), hb = thick(texture2D(uTexture, vUv - vec2(0.0, o.y)).rgb);
      vec3 n = normalize(vec3((hl - hr) * 9.0, (hb - ht) * 9.0, 1.0));
      vec3 l = normalize(vec3(-0.35, 0.55, 0.75));
      float diff = clamp(dot(n, l), 0.0, 1.0);
      float spec = pow(clamp(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 36.0);
      float body = smoothstep(0.022, 0.11, h);                       // the liquid itself: a defined edge
      float halo = smoothstep(0.0, 0.25, h) * 0.18;                  // soft light spilling past it
      vec3 base = 1.0 - exp(-c * 1.35);
      vec3 pearl = 0.5 + 0.5 * cos(6.2831 * (h * 1.3 + n.x * 0.25 - n.y * 0.15 + time * 0.02 + vec3(0.0, 0.33, 0.67)));
      vec3 col = base * (0.72 + 0.4 * diff);
      col += pearl * 0.14 * body;
      col += vec3(1.0, 0.96, 0.88) * spec * 0.85 * body;
      float a = clamp(max(body * 0.88, halo), 0.0, 0.94);
      col *= max(body, halo * 1.6);
      gl_FragColor = vec4(col, a); }`,
};

export class Fluid {
  constructor(canvas, { mobile = false } = {}) {
    this.cv = canvas;
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: true, powerPreference: "high-performance" };
    let gl = canvas.getContext("webgl2", params); const gl2 = !!gl;
    if (!gl) gl = canvas.getContext("webgl", params) || canvas.getContext("experimental-webgl", params);
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    let type, linear;
    if (gl2) { gl.getExtension("EXT_color_buffer_float"); gl.getExtension("EXT_color_buffer_half_float"); type = gl.HALF_FLOAT; linear = true; }
    else {
      const hf = gl.getExtension("OES_texture_half_float"); if (!hf) throw new Error("no half float");
      type = hf.HALF_FLOAT_OES; linear = !!gl.getExtension("OES_texture_half_float_linear");
    }
    const fmt = (i2, f2) => gl2 ? this.format(i2, f2, type) : this.format(gl.RGBA, gl.RGBA, type);
    this.fRGBA = fmt(gl.RGBA16F, gl.RGBA); this.fRG = fmt(gl.RG16F, gl.RG); this.fR = fmt(gl.R16F, gl.RED);
    if (!this.fRGBA || !this.fRG || !this.fR) throw new Error("half-float render targets unsupported");
    this.type = type; this.linear = linear;
    this.filter = linear ? gl.LINEAR : gl.NEAREST;

    // fixed quality tiers; the adaptive step only ever moves down
    this.tiers = mobile ? [[96, 384, 14], [80, 256, 10], [64, 192, 8]] : [[128, 640, 20], [112, 448, 14], [96, 320, 10]];
    this.tier = 0;
    this.curl = 10; this.velDiss = 0.9; this.dyeDiss = 0.24; this.pressureDecay = 0.8;
    this.speed = 0.4; this.viscosity = 0.35; this.viscPasses = 2; this.clock = 0;
    this.queue = []; this.maxSplatsPerFrame = 8; this.maxQueue = 48;
    this.timeScale = 1;

    const vs = this.shader(gl.VERTEX_SHADER, VS);
    const prog = (name, defs = "") => this.program(vs, this.shader(gl.FRAGMENT_SHADER, defs + HEAD + FS[name]));
    this.p = {
      clear: prog("clear"), splat: prog("splat"), divergence: prog("divergence"), curl: prog("curl"),
      vorticity: prog("vorticity"), viscous: prog("viscous"), pressure: prog("pressure"), gradient: prog("gradient"), display: prog("display"),
      advection: prog("advection", linear ? "" : "#define MANUAL_FILTERING\n"),
    };
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const ibuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    this.resize(); this.initFBOs();
  }

  // ------------------------------------------------------------ gl plumbing
  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  program(vs, fs) {
    const gl = this.gl, p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "aPosition"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  format(internal, format, type) {
    const gl = this.gl;
    const ok = (i, f) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, i, 4, 4, 0, f, type, null);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const good = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.deleteFramebuffer(fb); gl.deleteTexture(t); return good;
    };
    if (ok(internal, format)) return { internal, format };
    if (gl.RGBA16F && internal !== gl.RGBA16F) return this.format(gl.RGBA16F, gl.RGBA, type);
    return null;
  }
  fbo(w, h, f, filter) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, this.type, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, tx: 1 / w, ty: 1 / h,
      attach: (id) => { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; },
      free: () => { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); } };
  }
  double(w, h, f, filter) {
    const d = { a: this.fbo(w, h, f, filter), b: this.fbo(w, h, f, filter) };
    d.read = () => d.a; d.write = () => d.b; d.swap = () => { const t = d.a; d.a = d.b; d.b = t; };
    d.free = () => { d.a.free(); d.b.free(); };
    return d;
  }
  res(n) {
    const gl = this.gl, ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    const a = ar < 1 ? 1 / ar : ar, lo = Math.round(n), hi = Math.round(n * a);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [hi, lo] : [lo, hi];
  }
  initFBOs() {
    [this.dye, this.vel, this.div, this.curlT, this.pres].forEach(x => x && x.free());
    const [simN, dyeN, iters] = this.tiers[this.tier]; this.iters = iters;
    const [sw, sh] = this.res(simN), [dw, dh] = this.res(dyeN);
    this.dye = this.double(dw, dh, this.fRGBA, this.filter);
    this.vel = this.double(sw, sh, this.fRG, this.filter);
    this.div = this.fbo(sw, sh, this.fR, this.gl.NEAREST);
    this.curlT = this.fbo(sw, sh, this.fR, this.gl.NEAREST);
    this.pres = this.double(sw, sh, this.fR, this.gl.NEAREST);
  }
  resize() {
    const d = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; if (this.dye) this.initFBOs(); }
  }
  lowerQuality() {
    if (this.tier >= this.tiers.length - 1) return false;
    this.tier++; this.initFBOs(); return true;
  }
  blit(target) {
    const gl = this.gl;
    if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }
  use(name) { const pr = this.p[name]; this.gl.useProgram(pr.p); return pr.u; }

  // ------------------------------------------------------------ public api
  // x, y in 0..1 (y down, screen space); dx, dy velocity in px-ish/s; color 0..1 rgb; r radius factor
  splat(x, y, dx, dy, color, r = 1) {
    this.queue.push([x, 1 - y, dx, -dy, color[0], color[1], color[2], r]);
    if (this.queue.length > this.maxQueue) this.queue.splice(0, this.queue.length - this.maxQueue);
  }
  applySplat(s) {
    const gl = this.gl, [x, y, dx, dy, r, g, b, rad] = s, ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    const radius = (0.22 * rad / 100) * (ar > 1 ? ar : 1);
    let u = this.use("splat");
    gl.uniform1i(u.uTarget, this.vel.read().attach(0)); gl.uniform1f(u.aspectRatio, ar);
    gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, dx, dy, 0); gl.uniform1f(u.radius, radius);
    gl.uniform2f(u.texelSize, this.vel.read().tx, this.vel.read().ty);
    this.blit(this.vel.write()); this.vel.swap();
    gl.uniform1i(u.uTarget, this.dye.read().attach(0)); gl.uniform3f(u.color, r, g, b);
    this.blit(this.dye.write()); this.dye.swap();
  }
  step(dtReal) {
    const gl = this.gl, dtR = Math.min(dtReal, 1 / 30), dt = dtR * this.timeScale * this.speed; this.clock += dtR;
    this.resize();
    gl.disable(gl.BLEND);
    for (let i = 0; i < this.maxSplatsPerFrame && this.queue.length; i++) this.applySplat(this.queue.shift());
    const v = this.vel, tx = v.read().tx, ty = v.read().ty;
    let u = this.use("curl"); gl.uniform2f(u.texelSize, tx, ty); gl.uniform1i(u.uVelocity, v.read().attach(0)); this.blit(this.curlT);
    u = this.use("vorticity"); gl.uniform2f(u.texelSize, tx, ty); gl.uniform1i(u.uVelocity, v.read().attach(0));
    gl.uniform1i(u.uCurl, this.curlT.attach(1)); gl.uniform1f(u.curl, this.curl); gl.uniform1f(u.dt, dt); this.blit(v.write()); v.swap();
    u = this.use("viscous"); gl.uniform2f(u.texelSize, tx, ty); gl.uniform1f(u.amount, this.viscosity);
    for (let i = 0; i < this.viscPasses; i++) { gl.uniform1i(u.uVelocity, v.read().attach(0)); this.blit(v.write()); v.swap(); }
    u = this.use("divergence"); gl.uniform2f(u.texelSize, tx, ty); gl.uniform1i(u.uVelocity, v.read().attach(0)); this.blit(this.div);
    u = this.use("clear"); gl.uniform1i(u.uTexture, this.pres.read().attach(0)); gl.uniform1f(u.value, this.pressureDecay); this.blit(this.pres.write()); this.pres.swap();
    u = this.use("pressure"); gl.uniform2f(u.texelSize, tx, ty); gl.uniform1i(u.uDivergence, this.div.attach(0));
    for (let i = 0; i < this.iters; i++) { gl.uniform1i(u.uPressure, this.pres.read().attach(1)); this.blit(this.pres.write()); this.pres.swap(); }
    u = this.use("gradient"); gl.uniform2f(u.texelSize, tx, ty); gl.uniform1i(u.uPressure, this.pres.read().attach(0));
    gl.uniform1i(u.uVelocity, v.read().attach(1)); this.blit(v.write()); v.swap();
    u = this.use("advection"); gl.uniform2f(u.texelSize, tx, ty);
    if (!this.linear) gl.uniform2f(u.dyeTexelSize, tx, ty);
    const vid = v.read().attach(0); gl.uniform1i(u.uVelocity, vid); gl.uniform1i(u.uSource, vid);
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, this.velDiss); this.blit(v.write()); v.swap();
    if (!this.linear) gl.uniform2f(u.dyeTexelSize, this.dye.read().tx, this.dye.read().ty);
    gl.uniform1i(u.uVelocity, v.read().attach(0)); gl.uniform1i(u.uSource, this.dye.read().attach(1));
    gl.uniform1f(u.dissipation, this.dyeDiss * dtR / Math.max(dt, 1e-4)); this.blit(this.dye.write()); this.dye.swap();
    // draw
    u = this.use("display"); gl.uniform2f(u.texelSize, this.dye.read().tx, this.dye.read().ty);
    gl.uniform1i(u.uTexture, this.dye.read().attach(0)); gl.uniform1f(u.time, this.clock);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
    this.blit(null);
  }
}
