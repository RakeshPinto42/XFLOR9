# Shared audio architecture (phase A1)

Status: A1 built (2026-11-24): engine and mixer (`src/engine/audio/`), sound control in the site
header, radio following overall × music volume, scene bridge (`src/stage/audio/`) with the monsoon
rain bed, roof/eave spatial loops and distance-delayed thunder. All current sound is procedural
(`synth.ts`), so no audio files exist yet. Not yet built: dialogue content, birds/frogs, children
and veranda-radio emitters (they wait for F4 characters and original music).
Creative rules: [creative-direction.md](creative-direction.md). Roadmap: [roadmap.md](roadmap.md).

## Goals

- One audio system for the whole site, used by every module and scene, and by the Studio.
- Separate volumes for **ambience**, **music** and **sound effects** (plus **dialogue** later), and a
  **master mute**, all remembered in this browser.
- Nothing plays before the visitor interacts (browser autoplay rules); a clear "sound on" control.
- Sound follows the picture: rain, thunder and neighbourhood life are driven by the same scene
  state as the visuals (the lightning flash triggers its thunder; rain intensity sets the rain bed).
- Only original or properly licensed audio, each file with a rights record like models and books.

## Architecture

| Layer | Location | Owns |
|---|---|---|
| Audio engine (plain TypeScript) | `src/engine/audio/` | One `AudioContext`, buses and gains, unlock-on-gesture, preferences, voice limits, fades, ducking |
| Scene bridge | `src/stage/audio/` | Starts/stops a scene's ambience with the scene; spatial emitters attached to 3D objects (three.js `PositionalAudio` on the shared listener at the camera) |
| Scene content | `src/scenes/<scene>/audio.ts` (later: the scene JSON from F2) | Which beds, emitters and events the scene uses |
| Assets | `public/assets/audio/`, `content/assets/manifest.json` (kind `audio`) | Files plus source, licence, author, duration, loudness |

### Buses (Web Audio graph)

```
emitters / beds ──► ambience bus ─┐
music, jingles  ──► music bus ────┼──► master (mute, overall volume) ──► speakers
interface sounds ─► effects bus ──┤
characters      ──► dialogue bus ─┘
```

- **Radio and TV are NOT routed through this graph.** Their streams come from other sites without
  cross-origin permission; routing them through Web Audio would silence them. The existing radio
  PlaybackEngine keeps its `<audio>` element; the audio engine controls it through the element's own
  volume (music volume × master) and mute. Ambience is ducked while radio or TV plays.
- Spatial sound uses one listener on the camera; emitters (a radio in a house, children playing,
  rain on a tin roof) are positioned in the scene. Distance roll-off and occlusion are kept simple
  and cheap.

### Behaviour rules

- First visit: silent, with a visible "Sound on" control. After the visitor turns sound on, the
  choice is remembered and the context resumes on their next interaction.
- Reduced motion does not mute sound, but a separate "reduce sudden sounds" preference softens
  thunder and other sharp effects.
- Hidden tab: ambience fades out; radio keeps its current behaviour (the visitor chose to play it).
- Quality modes: Lite and Still keep ambience (sound is cheap); only Full uses spatial emitters.
- Limits: a cap on simultaneous voices; long beds streamed, short effects decoded once and reused.

## The monsoon neighbourhood's sound (first target)

| Sound | Type | Synchronised with |
|---|---|---|
| Rain bed (light/heavy layers) | Ambience loop | Rain particle intensity |
| Rain on clay-tile and tin roofs, eaves dripping | Spatial loops near houses | Roof runoff |
| Thunder (distant rolls, delayed after the flash) | One-shot | Lightning strikes (`atmosphere.flash`) |
| Birds settling, frogs, crickets in the rain | Ambience layer | Time of day / rain lulls |
| Children playing, a cricket ball on a bat, bicycle bells | Spatial one-shots / loops | Character activities |
| A distant radio playing from a veranda | Spatial, original music only | A house with its door open |
| Interface sounds (retro clicks, tuning) | Effects | Site controls |

## Sourcing and rights

- Preferred: **original recordings and compositions** made for XPLOR9 (field recordings of rain,
  roofs and birds are easy to make well), and procedurally generated sound where it suits (rain
  beds can be synthesised).
- Otherwise CC0 sound libraries, with each file's source, licence and author recorded. No CC BY-NC,
  no "royalty-free" clips without a verifiable licence, no ripped TV or film audio, no copyrighted
  songs or jingles (including Doordarshan or brand jingles), even as short clips.
- Music and jingles are original compositions, commissioned or produced for XPLOR9.

## Build order (A1)

1. Engine: context, buses, preferences, unlock, ducking API; unit tests.
2. Sound controls in the site shell (master mute, three sliders), accessible and remembered.
3. Radio integration through the element's volume (no change to how streams play).
4. Scene bridge and spatial emitters; the monsoon scene's rain bed, thunder and roof sounds.
5. Rights records for audio files: a test fails if any file under `public/assets/` (audio included)
   has no manifest record. The manifest gains an `audio` record kind with the first recording.
