"""Build web assets from ../../bard-ambient/sounds: MP3 audio, splash art and manifest.json.

Run from the repo root:  python tools/build_assets.py
"""
import os, glob, json, subprocess, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "bard-ambient", "sounds")
AUDIO = os.path.join(ROOT, "audio")
ART = os.path.join(ROOT, "art")
os.makedirs(AUDIO, exist_ok=True); os.makedirs(ART, exist_ok=True)
SR = 44100


def category(n):
    if n == "LoginTheme": return "theme"
    if n in ("Select", "Select_SFX", "Ban"): return "cue"
    if "UpgradeCeremony" in n: return "ceremony"
    if "Passive_Chime" in n: return "chime"
    if "MeepSpawn" in n: return "spawn"
    if "Move_Meep" in n: return "meep"
    if "DanceLoop" in n: return "danceloop"
    if "Recall" in n: return "recall"
    if "_W_" in n: return "shrine"
    if "R_SFX" in n: return "ult"
    return "emote"


def skin(n):
    s = n.split("_")[0]
    return s if s in ("Original", "Astronaut", "CafeCuties", "SnowDay", "Elderwood") else "Client"


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


clips = []
for p in sorted(glob.glob(os.path.join(SRC, "*", "*.ogg"))):
    name = os.path.splitext(os.path.basename(p))[0].replace("Bard_", "")
    x = load(p)
    # level match to -20 dBFS RMS on the audible part (the engine applies this gain)
    mono = np.abs(x).max(1)
    act = x[mono > mono.max() * 0.01]
    rms = np.sqrt((act ** 2).mean()) + 1e-9
    norm_db = 20 * np.log10(min(0.1 / rms, 0.9 / (mono.max() + 1e-9)))
    # onset/tail profile -> loop material vs one-shot
    w = int(0.03 * SR); nb = len(x) // w
    lv = 10 * np.log10(np.square(x[:nb * w]).reshape(nb, -1).mean(1) + 1e-12)
    head, tail, pk = lv[0] - lv.max(), lv[-1] - lv.max(), int(np.argmax(lv)) * 0.03
    cat = category(name)
    loopy = cat in ("chime", "danceloop") and (tail > -35 or (head > -25 and pk > 1.0))
    out = os.path.join(AUDIO, name + ".mp3")
    if not os.path.exists(out):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p, "-ar", "44100", "-c:a", "libmp3lame",
                        "-q:a", "2", out], check=True)
    clips.append(dict(name=name, file=f"audio/{name}.mp3", cat=cat, skin=skin(name),
                      dur=round(len(x) / SR, 3), norm=round(float(norm_db), 2), loop=bool(loopy)))

SPLASH = {"default": 0, "elderwood": 1, "snowday": 5, "astronaut": 8, "cafecuties": 17,
          "shanhai": 26, "spiritblossom": 37}
for key, num in SPLASH.items():
    dst = os.path.join(ART, f"{key}.jpg")
    if not os.path.exists(dst):
        url = f"https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Bard_{num}.jpg"
        open(dst, "wb").write(urllib.request.urlopen(url, timeout=30).read())

json.dump(dict(clips=clips, art={k: f"art/{k}.jpg" for k in SPLASH}),
          open(os.path.join(ROOT, "manifest.json"), "w"), indent=1)
print(len(clips), "clips;", sum(c["loop"] for c in clips), "loop-type")
