# XPLOR9 roadmap

Last updated: 2026-11-27. Open issues and technical debt: [known-issues.md](known-issues.md).
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
| **P2 Your data**: back up every app to one file and restore it (checked first, all or nothing, per app); storage used per app; clear one app or everything | this milestone |
| **P1 Reliability**: crash isolation per window, keyboard focus follows windows, session restore of open windows, live radio reconnects by itself | dc084d3 |
| **D3 YouTube discovery**: search in Video through a server route (key server-side only), cached results, daily budget and per-visitor limit, validated results, search-or-link address bar, more results | 6d681bf |

## Product completion first (2026-11-27, the owner's direction)

Functionality first, visual refinement later. The current XP/7-inspired interface stays as it is;
UI changes happen only where functionality, usability, accessibility or a real defect needs them.
A dedicated UI/UX phase follows once the product is functionally complete.

Audit of what is still missing (checked in the code on 2026-11-27):

| Area | What works | What's missing or fragile |
|---|---|---|
| Desktop | Windows, taskbar, start menu, tray, themes, sounds, phones | One app crashing takes down the whole desktop (no error boundaries). New windows don't take keyboard focus. Open windows are lost on reload. No backup of local data. |
| Radio | Search, filters, favourites, history, presets, tuner, persistent playback | 105 of 606 HTTPS Indian stations (22 of the top 100) are HLS and only play in Safari. A dropped stream doesn't reconnect on its own. |
| Music | Playlist, equaliser, visualiser, library, favourites | Only one playlist. Can't add songs found in Video. Records restart from the beginning. |
| Television | Channels, guide, favourites, recents, transport, Where to Watch | Long programmes restart from the beginning; a series (YouTube playlist) doesn't move on by itself. |
| Video | Search (with key), featured, channels, links, history, favourites | No way to keep a list ("watch later" / playlists); long videos restart from the beginning. |
| Arcade | Saanp, Mines (3 levels), best scores | Two games only. |
| Reading Room | Catalogue, EPUB/PDF reader, bookmarks, search, imports | Imported books have no bookmarks or search (RR-3). No Hindi/Kannada catalogue books yet (rights work). |
| Across apps | One sound at a time | The tray only knows the radio/records player, not TV, Video or Music videos. No search across the whole computer. |
| Release | Tests, security suite | Not deployed: hosting, the separate reader origin, site-wide security headers and a performance budget are still to do. |

Milestones, in order (core functionality → integration dependencies → user value → technical risk → complexity):

| # | Milestone | Scope | Why here |
|---|---|---|---|
| P1 | Reliability | Crash isolation per window (a failed app shows "stopped working" with Restart/Close; others and playback carry on). Keyboard focus moves into opened windows and back to the taskbar. Open windows come back after a reload. Live radio reconnects by itself after a dropped stream or when the network returns. | Core: a failure anywhere currently breaks everything; everything else builds on this. |
| P2 | Your data | Back up all XPLOR9 data to a file and restore it (validated); storage used per app; clear one app's data or everything. In the Control Panel. | Everything lives only in this browser: without a backup, one cleared cache loses favourites, playlists and progress. |
| P3 | One media system | The tray shows whatever is playing in any app (radio, records, TV, Video, Music videos) with pause, stop and "show". Music gets named playlists; songs and videos from Video and TV can be added to them. | Integration dependency for P4/P5; high user value. |
| P4 | Pick up where you left off | Resume position for long programmes, videos and records; "Continue watching" in TV and Video; a series plays on. | Continuity is core to media apps. |
| P5 | Find anything | A search box in the start menu across stations, presets, songs, tapes, programmes, books and your videos, with "search YouTube / radio for…" hand-offs. | Discovery across apps, using P3's shared model. |
| P6 | More radio | HLS stations in every browser (hls.js, only for hosts that allow it; streams are never proxied). Measured on real stations before adoption. | Unlocks about a fifth of Indian stations; adds a dependency, so it comes after the core. |
| P7 | Reading Room completion | Bookmarks and search inside imported books. | Closes RR-3. Hindi/Kannada books wait for verified editions (content, not code). |
| P8 | Arcade | An original patience card game. | User value; contained. |
| P9 | Phone pass | Real-device checks and fixes on the owner's phone. | Needs the phone model. |
| P10 | Release readiness | Hosting and the separate reader origin, site-wide security headers, performance budget, licensing review of the catalogues, accessibility audit. | Needs decisions on hosting, domain and cost from the owner. |
| — | UI/UX phase | The dedicated redesign, after P1–P10. | As directed. |

Content and decisions that only the owner can supply (they don't block the code milestones):
a YouTube Data API key (search), the phone model (P9), hosting/domain/cost (P10), and review of
catalogue additions (more TV, music, Hindi/Kannada books).

Dropped from the earlier D4 list as decorative: the screensaver and dragging desktop icons. Deferred:
a Paint-style app (reconsider after P8).

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
