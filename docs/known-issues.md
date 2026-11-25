# Known issues and technical debt (for the product-wide audit)

Recorded as found, so the final audit has one list. Severity is a first estimate.
Last updated: 2026-11-23 (F1 increment 1).

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

## 3D stage (F1)

| # | Issue | Severity | Found | Notes |
|---|---|---|---|---|
| ST-1 | React Three Fiber 9.8.2 logs "THREE.Clock: This module has been deprecated" (three r187). Harmless; comes from R3F internals. | Info | F1.1 | Re-check on the next R3F update. |
| ST-2 | drei 10.7.9 depends on stats-gl, which brings a second copy of three (0.170) into node_modules. Not bundled unless drei's `StatsGl` is used, so it is not used. | Low | F1.1 | Technical debt: watch bundle analysis. |
| ST-3 | Scene pages give the site header/footer a backdrop through a global CSS rule keyed on `html[data-stage-active]`. Works, but a layout-level slot for scene pages would be cleaner once more scenes exist. | Low | F1.1 | Technical debt. |
| ST-4 | Headless browsers render WebGL in software: stage tests prove correctness only, never frame rates. Performance is measured on the reference laptop. | Info | F1.1 | |
| ST-5 | During development, Turbopack missed a CSS change appended from the shell until the file was edited again. | Info | F1.1 | Development only. |
| ST-6 | `npm audit` reports 4 moderate advisories (glob/minimatch DoS via crafted patterns) inside the development-only asset tools (@gltf-transform/cli). They only run locally on our own fixed paths and never ship to the site; not force-upgraded (breaking). | Low | F1.2 | Re-check when @gltf-transform updates. |
| ST-7 | The Khronos validator can't inspect inside Draco-compressed geometry; the build compensates by decoding the result and comparing counts with the source. | Info | F1.2 | |
| ST-8 | A model that fails to load stays failed for the visit (the scene shows Lite with a reason); reloading retries. Intentional: retrying inside React suspense looped forever. | Info | F1.2 | |
| ST-10 | Monsoon scene: the free (debug) camera can still look past the edge of the world; the cinematic camera never does. | Info | F1.3 | |
| ST-11 | Monsoon scene: houses are generated procedurally from plastered and tiled boxes; they read as village houses but lack fine detail (eaves trim, grilles, clutter). Upgrades come with the Studio (S1–S3) and the U1 phase. | Low | F1.3 | Planned. |
| ST-12 | Monsoon scene: activity locations are empty until F4 characters exist; the street currently has no people. | Info | F1.3 | F4. |
| ST-13 | Headless WebKit renders the monsoon scene slowly in software; in one full regression run the following WebKit test's page setup timed out once (passed on re-run). | Low | F1.3 | Watch for repeats. |
| SF-1 | Scene format: `interactions` and `transitions` are placeholders (id, kind/trigger, target) until the phases that design them. | Info | F2 | F4, M, U2. |
| SF-2 | Scene format: the upgrade chain is empty because only format 1 exists; the mechanism is unit-tested with test steps. | Info | F2 | First format change. |
| SF-3 | An invalid scene file falls back to Lite through the existing scene error path; this is covered by unit tests of the validator, not by a browser test with a broken file. | Low | F2 | Add when the Studio can save files. |
| SF-4 | The monsoon camera path's aiming rule (look down the lane, drawn to its centre) is still code; the file sets only the path, loop time and look-ahead. F3 generalises cameras. | Low | F2 | F3. |
| ST-9 | The F1 scene uses a stand-in box for the TV cabinet until increment 3 builds the teak cabinet, sofa, centre table and three-blade fan. | Info | F1.2 | |

## TV (M3)

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| TV-1 | The Internet Archive's player reports nothing to the page, so XPLOR9 can't tell when an Archive film is playing, paused or finished (no auto-next; it counts as "on" while shown). YouTube programmes report all of these. | Low | M3 | Provider limitation |
| TV-2 | The Internet Archive player logs its own script errors in the browser console (inside its frame); they don't affect XPLOR9. | Info | M3 | Provider |
| TV-3 | A YouTube playlist (a series) only reports per-video events, so the TV doesn't move to the next programme when a series ends. | Info | M3 | By design |
| TV-4 | Languages marked "not recorded" (several Films Division shorts, two documentaries) need checking by watching. | Low | M3 | Content review |
| TV-5 | Picture House films: whether each Internet Archive copy carries a later (possibly copyrighted) music track is unverified; the films themselves are public domain. | Medium | M3 | Content review before release |

## Homepage (Monsoon Lane)

| ID | Issue | Severity | Found | Status |
|---|---|---|---|---|
| HM-1 | Lite and Still show the old monsoon poster, without the five signboards; the list of links is the way in. | Low | Home 3D | Render a new poster (`npm run stage:poster`) |
| HM-2 | Headless Chromium draws the street at about 1 frame a second (software WebGL), so the sign-click test needs a long timeout. Real GPUs are unaffected (see ST-4). | Info | Home 3D | Test environment |
| HM-3 | The homepage now downloads three.js on a first visit (it used to be a light page). Slow devices fall back to Lite/Still, but first-load size should be checked in the performance audit. | Medium | Home 3D | Performance audit |
