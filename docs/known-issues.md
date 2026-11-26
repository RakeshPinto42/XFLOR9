# Known issues and technical debt (for the product-wide audit)

Recorded as found, so the final audit has one list. Severity is a first estimate.
Last updated: 2026-11-27 (P1).

## Reading Room

| # | Issue | Severity | Found | Notes |
|---|---|---|---|---|
| RR-1 | Saved place and bookmarks for **Treasure Island** were made against the old Gutenberg #120 edition. After the R5 switch to the Standard Ebooks edition, the reader opens at the start with the "couldn't find your saved place" notice; old bookmarks may not land on the right page. | Low | R5 | Only affects browsers that read Treasure Island before R5 (development/testing). |
| RR-2 | foliate-js occasionally throws `Cannot destructure property 'style' … as it is null` while laying out a page before its `<body>` exists (seen under heavy load). It recovers; the imported-book reader tolerates it with a 3 s grace period. | Low | R4 | Upstream library behaviour (paginator.js `setStylesImportant`). |
| RR-3 | Imported books have no bookmarks or search; links inside PDFs are not clickable. | Medium (feature gap) | R4 | By design for R4. |
| RR-4 | PDFs with JPEG 2000 / JBIG2 images may show blank areas (PDF.js needs WebAssembly, not allowed by the reader's policy); CJK PDFs without embedded fonts may render poorly (no CMaps bundled). | Low | R4 | |
| RR-5 | Import release conditions still open: production reader origin (deployment), low-memory phone check (needs the phone model), wider third-party EPUB compatibility set. | Medium | R4 | See docs/security/import-isolation.md. |
| RR-6 | The isolated reader page inherits the site layout (header, mini-player) and hides it with `inert`. A separate root layout for `/isolated` would be cleaner. | Low | R4 | |
| RR-7 | Unknown book IDs: the first request streams a 200 "not found" page (noindex), later requests return 404 (Next.js 16 Cache Components behaviour). | Low | R1 | Accepted in R1; no `proxy.ts` fix. |
| RR-8 | Large illustrated files: Indian Fairy Tales 3.3 MB, The Giant Crab 1.6 MB, The Adventures of Akbar 1.2 MB. | Low | R5 | Consider image optimisation in the performance audit. |
| RR-10 | **Fixed in R5.** Since R1, Firefox blocked every reader font (Literata, Noto Serif Devanagari, Noto Serif Kannada) in book pages and fell back to system fonts: book pages are blob: documents and Firefox doesn't match CSP `'self'` there. Chromium allowed them, so earlier Chromium-only checks missed it. Fix: the exact site origin is named in `font-src` (book-page CSP and the isolated reader header). | Was Medium | R5 | Now covered by a cross-browser regression test (font loaded + conjunct shaping). |
| RR-11 | Some book-supplied styles override the reader font on individual elements (e.g. the Project Gutenberg "Compiler:/Illustrator:" lines show in a system serif). | Low | R5 | Cosmetic; the reader stylesheet sets `font-family` on `body` only. |
| RR-9 | No Hindi or Kannada catalogue books yet: source editions need verification (see R5 report). Indic rendering is tested with the Indic sample book. | Medium | R5 | Blocked on rights/source decisions. |

## Platform / tooling

| # | Issue | Severity | Found | Notes |
|---|---|---|---|---|
| PL-1 | Radio Browser SRV discovery fails on some networks (`querySrv ECONNREFUSED`); the client falls back to `/json/servers` as designed, but logs a warning each start. | Low | M2 | |
| PL-2 | Mixed line endings appeared after `git stash`; scripted text edits then silently failed to match. Consider a `.gitattributes` with `* text=auto eol=lf`. | Low | R4 | Developer hygiene. |
| PL-3 | Wikimedia sites block unidentified automated clients (bot challenge / UA policy); Project Gutenberg's main site has maintenance windows (the PGLAF mirror works but is slow). | Info | R5 | Affects future catalogue work only. |

## Retired with the 3D stage (D1, 2026-11-26)

ST-1 to ST-13, SF-1 to SF-4 and HM-1 to HM-3 no longer apply: the Three.js stage, scenes, scene
format and 3D homepage were removed (archived at tag `cinematic-3d-archive`). ST-6 (npm audit
advisories in the 3D asset tools) is resolved: `npm audit` now reports 0 vulnerabilities.

## TV (M3)

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| TV-1 | The Internet Archive's player reports nothing to the page, so XPLOR9 can't tell when an Archive film is playing, paused or finished (no auto-next; it counts as "on" while shown). YouTube programmes report all of these. | Low | M3 | Provider limitation |
| TV-2 | The Internet Archive player logs its own script errors in the browser console (inside its frame); they don't affect XPLOR9. | Info | M3 | Provider |
| TV-3 | A YouTube playlist (a series) only reports per-video events, so the TV doesn't move to the next programme when a series ends. | Info | M3 | By design |
| TV-4 | Languages marked "not recorded" (several Films Division shorts, two documentaries) need checking by watching. | Low | M3 | Content review |
| TV-5 | Picture House films: whether each Internet Archive copy carries a later (possibly copyrighted) music track is unverified; the films themselves are public domain. | Medium | M3 | Content review before release |

## Desktop (D1)

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| DK-1 | **Fixed in D2.** Every application now has its own desktop interface (Music, Radio, Television, Video, Arcade with Saanp and Mines windows, Reading Room). | Was Medium | D1 | Fixed |
| DK-2 | The tray's overall volume and Mute don't reach YouTube's or the Internet Archive's players. Each app's own volume slider does set YouTube's player (through its API); the Internet Archive player has no remote control. | Low | D1 | Partly fixed in D2 |
| DK-3 | **Done in D3.** Video searches all of YouTube once YOUTUBE_API_KEY is set on the server (see README). | Was Medium | D1 | Done |
| DK-4 | A channel's "latest uploads" list is the rights holder's own uploads, but not curated by era. | Low | D1 | Content review |
| DK-5 | **Fixed in P1.** Open windows (and whether each was minimised or maximised) come back after a reload in the same session; logging off or turning off clears them. Apps start fresh: a video or station doesn't resume playing by itself. | Was Low | D1 | Fixed |
| DK-6 | Alt+Tab and the Windows key belong to the operating system; the desktop uses Ctrl+Esc for the start menu and the taskbar for switching. | Info | D1 | Browser limitation |
| DK-7 | The Reading Room's frame shares the browser's history: the browser's own Back button can step back inside the Reading Room before leaving the desktop. The window's Back/Forward buttons and address bar follow the frame. | Low | D1 | |
| DK-8 | Desktop icons can't be dragged into a custom arrangement. | Low | D1 | Planned: D4 |
| DK-9 | **Fixed in D2.** Music and TV copy from the 3D rooms was rewritten. | Was Low | D1 | Fixed |

## D2 applications

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| D2-1 | **Fixed in D2.** Since M4, a finished record never moved on to the next song: browsers fire `pause` just before `ended`, and the player treated that as the visitor pausing. Unit-tested now with the real event order. | Was Medium | D2 | Fixed |
| D2-2 | The equaliser, balance and spectrum visualiser work on the public-domain records only. YouTube's player is another site's frame, so no website can process its sound; Music says so instead of faking it. | Info | D2 | Platform limit |
| D2-3 | Music's volume slider is the shared player's volume, so it also sets the radio's volume (one remembered player volume). | Low | D2 | By design |
| D2-4 | A playlist that reaches a YouTube song while the Music window is closed stops there: YouTube requires its player to be visible. Records keep playing with the window closed. | Info | D2 | Provider terms |
| D2-5 | Playwright's WebKit build on Windows can't play any audio (and has no Web Audio), so tests that need real sound skip there and say why; the rest of those tests still run. Real Safari plays audio. | Info | D2 | Test environment |
| D2-6 | The tuner dial shows channel positions, not FM frequencies: the station directory doesn't publish frequencies, and none are invented. | Info | D2 | By design |
| D2-7 | The visual reference image mentioned in the D2 brief did not arrive with the message; D2 follows the written direction until it is shared. | Info | D2 | Waiting for the image |
| D2-8 | **Fixed in D2.** A race on slow browsers: Ctrl+Esc pressed in the instant after the desktop first painted could be missed (the shortcut listener attaches right after). The desktop now marks when its shortcuts are live; tests wait for that. | Was Low | D2 | Fixed |
| D2-9 | Video's History and Favourites keep up to 50 items each; every saved entry is re-validated as a YouTube id when read back. | Info | D2 | By design |
| D2-10 | The Arcade has two games. More (a card game, a drawing app) are planned for D4. | Info | D2 | Planned |

## D3 YouTube discovery

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| D3-1 | Search needs a YouTube Data API key on the server. None is configured in this repository; live search has been verified only with stand-in responses (unit and browser tests), not against Google. | Medium | D3 | Waiting for a key |
| D3-2 | The cache, daily budget and per-visitor limit live in each server instance's memory. On serverless hosting, instances don't share them, so the true stop is Google's own quota answer (handled: search closes for the day). | Low | D3 | By design |
| D3-3 | Search result thumbnails load from YouTube (i.ytimg.com) once the visitor has searched; nothing loads from YouTube before that. | Info | D3 | By design |
| D3-4 | Search shows only videos their owners allow to be embedded (videoEmbeddable=true); some popular videos are therefore missing. SafeSearch is "moderate". | Info | D3 | By design |

## P1 Reliability

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| P1-1 | **Fixed in P1.** Any app failing (a bug while drawing, or its code not downloading) took down the whole desktop. Each window now contains its own failure, with Restart and Close; everything else, including playback, carries on. | Was High | P1 | Fixed |
| P1-2 | **Fixed in P1.** New windows didn't take keyboard focus. Focus now moves into a window that opens or comes forward, to its taskbar button when minimised, and to Start when closed. | Was Medium | P1 | Fixed |
| P1-3 | **Fixed in P1.** A live station that dropped showed an error at once. It now reconnects by itself (after 2, 5 and 10 seconds) and comes back when the internet returns. A stream that fails to connect is retried once: browsers report that the same way as an unplayable format. | Was Medium | P1 | Fixed |
| P1-4 | If an app's code download hangs without failing (no error from the browser), its window stays on "Starting…"; Close still works. Not seen in practice; a load that fails outright is handled. | Low | P1 | Watch |
| P1-5 | Restarting an app whose code failed to download may need a reload of XPLOR9 (the message offers it; open windows come back). | Low | P1 | By design |
| P1-6 | In one full WebKit run under heavy load, the bookshelf search test typed before the page had finished starting and missed the result; it passed on every re-run (3 of 3). | Low | P1 | Watch (test timing) |
