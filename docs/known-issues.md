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
