# Known issues and technical debt (for the product-wide audit)

Recorded as found, so the final audit has one list. Severity is a first estimate.
Last updated: 2026-11-26 (D1 desktop).

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
| DK-1 | Radio, TV, Music, Games and the Reading Room keep their earlier web-page styling inside their windows (beige pages, rounded cards). They work fully, but don't yet look like desktop applications. | Medium | D1 | Planned: D2 |
| DK-2 | The master volume and Mute don't reach YouTube's or the Internet Archive's players; those have their own volume controls. | Low | D1 | YouTube could be scaled through its player API (D2) |
| DK-3 | Video can't search all of YouTube: that needs a YouTube Data API key on the server. Featured items, verified channels and pasted links work. | Medium (feature gap) | D1 | Planned: D3 |
| DK-4 | A channel's "latest uploads" list is the rights holder's own uploads, but not curated by era. | Low | D1 | Content review |
| DK-5 | Open windows are not reopened after a reload or a new log-in; only each app's window place is remembered. | Low | D1 | By design for now |
| DK-6 | Alt+Tab and the Windows key belong to the operating system; the desktop uses Ctrl+Esc for the start menu and the taskbar for switching. | Info | D1 | Browser limitation |
| DK-7 | The Reading Room's frame shares the browser's history: the browser's own Back button can step back inside the Reading Room before leaving the desktop. The window's Back/Forward buttons behave as expected. | Low | D1 | |
| DK-8 | Desktop icons can't be dragged into a custom arrangement. | Low | D1 | Planned: D4 |
| DK-9 | Music and TV copy still mention "the shop's TV" and "the family set" from the 3D rooms in a few places. | Low | D1 | D2 |
