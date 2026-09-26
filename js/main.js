import { Engine } from "./engine.js";
import { Visuals } from "./visuals.js";

const $ = (id) => document.getElementById(id);
const manifest = await (await fetch("manifest.json")).json();
const vis = new Visuals($("sky"), $("fluid"));

const artLayers = [$("artA"), $("artB")]; let artIdx = 0, artKey = null;
function showArt(key) {
  if (key === artKey) return; artKey = key;
  const next = artLayers[artIdx ^ 1], cur = artLayers[artIdx];
  const img = new Image(); img.src = manifest.art[key];
  img.onload = () => { next.style.backgroundImage = `url(${img.src})`; next.classList.add("on"); cur.classList.remove("on"); artIdx ^= 1; };
}
showArt("default");
Object.values(manifest.art).forEach(src => { const i = new Image(); i.src = src; });  // warm cache

let engine;
const begin = $("begin");
const later = (when, fn) => setTimeout(fn, Math.max(0, (when - engine.now) * 1000));
const engineOpts = {
  onProgress: (p) => begin.style.setProperty("--p", p.toFixed(3)),
  onEvent: (ev) => later(ev.when, () => vis.spawn(ev)),
  onScene: (sc, when) => later(when, () => { showArt(sc.art); vis.setScene(sc.id); }),
};
begin.disabled = false;

async function start() {
  if (engine) return;
  begin.disabled = true;
  engine = new Engine(manifest, engineOpts);
  try { await engine.start(); }
  catch (err) { console.error(err); begin.disabled = false; engine = null; return; }
  window.bard = engine; window.bardVis = vis;
  vis.attach(engine.analyser);
  engine.setVolume(+$("volume").value);
  $("intro").classList.add("gone");
  $("hud-controls").classList.remove("hidden");
  wake();
}
begin.addEventListener("click", start);
if (new URLSearchParams(location.search).has("autostart")) start();

async function togglePause() {
  if (!engine) return;
  const paused = await engine.togglePause();
  $("ico-pause").hidden = paused; $("ico-play").hidden = !paused;
}
$("pause").addEventListener("click", togglePause);
$("volume").addEventListener("input", (e) => engine && engine.setVolume(+e.target.value));
const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
$("fs").addEventListener("click", fullscreen);
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); engine ? togglePause() : start(); }
  if (e.key === "f" || e.key === "F") fullscreen();
});
let idle;
function wake() { document.body.classList.remove("idle"); clearTimeout(idle); idle = setTimeout(() => engine && document.body.classList.add("idle"), 3500); }
["mousemove", "pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, wake, { passive: true }));
if ("wakeLock" in navigator) addEventListener("click", () => navigator.wakeLock.request("screen").catch(() => {}), { once: true });
