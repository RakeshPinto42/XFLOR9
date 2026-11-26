# XPLOR9 roadmap

Last updated: 2026-11-26. Open issues and technical debt: [known-issues.md](known-issues.md).
Architecture: [desktop-architecture.md](desktop-architecture.md).

## Product direction (2026-11-26, the owner's brief)

XPLOR9 is a nostalgic personal computer from 1990–2010, inspired by the desktops of the early 2000s:
switch it on, log in, and find radio, television, music, video, games and a reading room inside, as
real working applications in movable windows. **Not** a cinematic website, a 3D world or a film.

The cinematic Three.js direction (monsoon street, living room, cameras, scene format, Studio plans)
is retired. Its last state is tagged `cinematic-3d-archive` (commit `0abc9c9`) and can be restored
from there; the monsoon render lives on as a wallpaper.

## Done

| Milestone | Commit |
|---|---|
| M1–M4 Foundation, radio data, playback engine, favourites/history/filters/tuner | 625e340 · 1fdc453 · a5ae3ac · 0c26e98 |
| R1–R5 Reading Room catalogue, reader, search, bookmarks, personal imports | 67be2b4 · 869719b · 0c213fd · 67cf362 · ba7871e |
| Security review and import isolation | 3581cb3 · a408599 |
| TV, Music, Games modules (checkpoint before the desktop redesign) | 0abc9c9 |
| **D1 Desktop**: boot, welcome, desktop, windows, taskbar, start menu, tray, themes, wallpapers, system sounds, Video, Notepad, Control Panel; 3D retired | e40b618 |
| **D2 Applications**: XPLOR9 Amp (Music: playlist, equaliser, visualiser, video pane), XPLOR9 Tuner (Radio: deck, presets, station table), Television and Video (shared media player, transport, history, favourites), Arcade (launcher, Saanp and Mines windows with menus and levels), Reading Room (Explorer layout, icon and details views); Geist interface type; shared window menu bar | 89c70df |
| **D3 YouTube discovery**: search in Video through a server route (key server-side only), cached results, daily budget and per-visitor limit, validated results, search-or-link address bar, more results | this milestone |

## Next, in order

| Phase | Scope |
|---|---|
| D4 More nostalgia | Screensaver after idle (original animation), a Paint-style drawing app saved locally, a card game (original Solitaire-style), a "My Computer" window with storage used and a clear-data control, desktop icon arrangement by drag. |
| D5 Mobile pass | Test on the owner's phone (model to be provided); swipe between open apps; larger touch targets in app interiors. |
| Final audits | Accessibility, performance, security and licensing review of the whole product. |

## Decisions on record

- One desktop page (`/`); apps are windows. Old addresses (`/radio`, `/tv`, `/music`, `/games`,
  `/video`) redirect to `/?open=<app>`. The Reading Room keeps its own routes (reader, imports) and
  runs inside its window as a same-origin frame, so its reader security rules are unchanged.
- Each app has one window. Minimised windows stay mounted, so radio, video and games keep running.
- One sound at a time across windows (`src/lib/playback/mediaFocus.ts`).
- The look is inspired by early-2000s desktops but uses no Microsoft names, logos, wallpapers or
  sounds. Icons, wallpapers and system sounds are original (sounds are synthesised in the browser).
- The YouTube app is called **Video**: YouTube's branding rules don't allow its name in an app's
  name. Videos always play in YouTube's own player (reduced-cookie domain, click-to-load).
- Content rules are unchanged: official uploads from allow-listed rights-holder channels or public
  domain in India and the US; radio streams played directly (HTTPS only, never proxied).
