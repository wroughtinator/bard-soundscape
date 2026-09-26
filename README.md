# Bard — Endless Soundscape

**Live:** https://wroughtinator.github.io/bard-soundscape/

An endless, generative ambient soundscape built from every sound Bard, the Wandering Caretaker, has in League of Legends: his chimes, meeps, walking melodies, emotes, recalls, Caretaker's Shrine, Tempered Fate, and the login theme. It runs live in the browser and never plays the same way twice.

## How it works

- **Scenes.** Ten scenes crossfade forever (Starfall, Meep Trails, Observatory, Café in the Clouds, Snowfield, Elderwood Grove, Tempered Fate, The Caretaker's Song, Homeward, Beyond). Each has its own palette of skins, sound families, pitch set and energy range, and the next scene is picked at random while avoiding recent ones. The full login theme returns at most every 30 minutes.
- **Organ bed.** A PaulStretch pad stretched from the login theme, meep melodies and recalls runs in a Web Worker. It uses two interleaved voices with slow tone sweeps. It breathes in for 1.5–3.5 minutes, then recedes for 1–2.5 minutes, and lighter sounds step forward while it's away.
- **Voices.** Sounds are triggered stochastically, and they're combined in several ways:
  - A chime can be answered by another chime from the same skin.
  - A reverse swell can lead into a chime.
  - Sounds can leave echo trails.
  - Granular clouds are built from fragments of other sounds.
  - Meep melody layers can be stacked.
  - Emotes are paired with their skin's chimes.
  - Faint snatches of the theme drift in and out.
- **Key-safe pitch shifts.** Pitches only move by octaves, fourths or fifths, so everything stays in Bard's G/D key family. Sounds you haven't heard yet are favoured, and recent ones are held back.
- **Loop detection.** Clips that were cut from the middle of a sustained hum, which most of Bard's passive-chime sounds are, are detected offline from how their starts and ends sound. They're crossfade-looped and faded in and out, never dropped in like a one-shot.
- **Visuals.** Every sound gets its own analyser node, and its visual is drawn from that sound's live spectrum. Chimes bloom into spectral mandalas, and meep melodies are comets that spark on each note. Upgrade ceremonies are sunbursts, recalls are vortices, and the theme draws a constellation. Tempered Fate slows the whole sky. Everything sits on a noise-driven flow field over slowly drifting splash art.

Controls: **Space** pauses and **F** toggles fullscreen.

## Building the assets

`tools/build_assets.py` converts the source clips to MP3, profiles each one (level normalisation, loop versus one-shot), fetches the splash art from Data Dragon, and writes `manifest.json`. It's a static site with no build step and no dependencies.

## Legal

Bard — Endless Soundscape isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc. All sounds and artwork are © Riot Games. This is a free, non-commercial fan project.
