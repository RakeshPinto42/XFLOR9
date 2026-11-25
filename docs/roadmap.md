# XPLOR9 master roadmap

Last updated: 2026-11-23. Creative standard: [creative-direction.md](creative-direction.md).
Open issues and technical debt: [known-issues.md](known-issues.md).

Principle: one shared engine (rendering, scenes, assets, cameras, animation, audio, environment
effects, quality fallbacks) used by all five modules and by the Cinematic Studio. No module gets its
own renderer or duplicate system. Shared systems are built before module experiences.

## Done

| Milestone | Commit |
|---|---|
| M1 Foundation (shell, modules, local storage) | 625e340 |
| M2 Radio data layer | 1fdc453 |
| M3 Playback engine and mini-player | a5ae3ac |
| M4 Radio favourites, history, filters, tuner | 0c26e98 |
| R1–R3 Reading Room catalogue, reader, search, bookmarks | 67be2b4 · 869719b · 0c213fd |
| Security review and import isolation foundation | 3581cb3 · a408599 |
| R4 Personal imports (EPUB, PDF) | 67cf362 |
| R5 Catalogue to 17 books; Firefox font fix | ba7871e |

## Sequence

Each phase: short plan and definition of done first; then build, test (unit, security, regression in
Chromium, Firefox and WebKit), report automated tests separately from browser verification, commit and
push. Comprehensive audits come at the end.

| Phase | Scope | Depends on |
|---|---|---|
| **F1 Shared 3D foundation** *(in progress)* | One stage, lazy scenes, quality modes, adaptive quality, diagnostics, asset pipeline (Draco, WebP, manifest), living-room benchmark scene, desktop performance | – |
| F2 Scene format *(built; see `scene-format.md`)* | Versioned JSON shared by Studio and site: objects, materials, lights, environment and weather settings, cameras, keyframes, audio emitters, interactions, transitions; validation and upgrades | F1 |
| A1 Shared audio system | Web Audio mixer with buses (ambience, music, sound effects, dialogue) and master mute; per-bus volumes remembered; autoplay unlock on first interaction; spatial sound; ambience and one-shot playback from scene files; audio asset records | F2 (scene emitters) |
| F3 Cameras | Developer/free, isometric, top-down, first-person, third-person (playable), cinematic paths; shared settings and constraints | F2 |
| E1 Environment systems | Rain, mist and fog, wind, water, vegetation motion, day and weather presets, quality-scaled | F1, F2 |
| F4 Characters and cinematics | Original Indian child characters (see `character-system.md`): shared skeleton, clothing variants, locomotion, cycling, cricket/football/marbles, reading and sitting, conversations; later facial expressions and dialogue. Character controller, animation blending, timeline and camera keyframes | F3, A1 |
| S1–S3 Cinematic Studio (local tool) | Hierarchy, inspector, gizmos, GLB import; materials, lights, environment; cameras and timeline; characters, presets; JSON export/import | F2–F4, A1, E1 |
| U1 Monsoon neighbourhood | *Benchmark environment built in F1 increment 3 (`/lab/monsoon`): houses, vegetation, rain, mist, puddles, lightning, cinematic camera, F4 activity locations and A1 audio anchors; no characters yet.* First major environment: dark, misty Indian monsoon street with houses, trees, shops; the living room as one home's interior; establishing shot, ambience, interactions | S1–S3 |
| M1–M5 Module environments | Reading Room, Radio, Television, Music, Games placed in the world (see creative direction), each meeting the creative acceptance criteria while keeping functional UIs usable | U1 |
| U2 Connected universe | Transitions between locations, small open-world exploration with the third-person camera, homepage intro (short) and optional longer film | M1–M5 |
| Content phases (alongside) | Original characters and cast, original music, jingles and sound effects, concept art to production assets, multilingual catalogue (Hindi, Kannada) | Rights checks per item |
| Final audits | Accessibility, performance (desktop and the actual phone), security, licensing; then optimisation | Product substantially complete |

## Shared engine layout

| Layer | Location | Owns |
|---|---|---|
| Engine (plain TypeScript) | `src/engine/` | Quality modes, adaptive quality, resource tracking; later scene format, camera logic, timeline, audio graph logic |
| Stage (React Three Fiber) | `src/stage/` | The single canvas, scene registry, loaders, fallbacks, diagnostics |
| Scenes | `src/scenes/` | Scene content only |
| Assets | `public/assets/`, `content/assets/manifest.json` | Models, textures, audio, each with a rights record |

### Audio architecture constraints (A1)

- Radio and TV streams play through `<audio>`/embedded players from third-party hosts without CORS.
  Routing them through Web Audio would make them silent, so the mixer controls them through the
  element's own volume and mute (music bus and master mute), never by re-routing the stream.
- The existing radio PlaybackEngine stays the owner of radio playback; A1 adds coordination (ducking
  ambience while radio plays, master mute) around it.
- Nothing plays before the visitor interacts; reduced-motion and saved audio preferences are respected.

## Performance reference

Desktop reference: Lenovo Gaming 3 (Ryzen 5 5600H, 24 GB, GTX 1650 4 GB). Target for Full mode:
60 fps at 1080p, measured on that machine. Mobile targets are set only after testing on the actual
phone (model to be provided).

## Decisions on record

- Studio is a local development tool; scenes and assets are saved in the repository.
- Models: OptimizeGLB for suitable assets; local optimisation for paid, confidential or restricted
  ones; inspect before and after; preserve animation, skeletons and morph targets; record sources.
- Characters start from verified CC0 sources; licensed characters only via the future licensing route.
- Hindi and Kannada catalogue books wait for verifiable editions (see R5).
- 2026-11-24: order changed at the owner's request: after F3 step 1, TV (M3) and then Music (M4)
  are built now as complete Three.js modules; F3 steps 2–4 (isometric, top-down, walking modes,
  touch) resume afterwards. TV and Music content: official uploads from allow-listed rights-holder
  channels (YouTube, official player) or public domain in India and the US (Internet Archive);
  see `content/media/official-sources.json` and `npm run media:verify`.
- 2026-11-25: product-first, at the owner's request ("make it simple, build the product first end to
  end"). All five modules work end to end before more foundation work: Radio, Reading Room, TV (M3),
  Music (M4) and Games (M5: Saanp and Mines, 2D, best scores in this browser). F3 steps 2–4, E1, F4,
  Studio and the universe phases follow, in that order, once the owner has reviewed the working product.
