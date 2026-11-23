# Reading Room security review (pre-R4)

Date: 2026-11-23. Scope: EPUB reader (foliate-js 1.0.1) and the planned R4 personal imports (EPUB + PDF).
Method: code review plus a malicious-file corpus (`scripts/books/make-security-fixtures.ts` →
`test-fixtures/security/`) run through the production build in Chromium. Not tested: Safari/WebKit, Firefox.

## 1. Threat model

| Asset | Where it lives |
|---|---|
| Reading progress, bookmarks, favourites, recent | IndexedDB `xplor9-reading` (XPLOR9 origin) |
| Radio favourites/history, preferences | localStorage (XPLOR9 origin) |
| Future: imported book files | IndexedDB (XPLOR9 origin) |
| Reader privacy (what/when/where someone reads) | Network requests made while reading |

Attacker: anyone who gets a user to import a crafted EPUB/PDF (shared file, download site).
Not in scope: a compromised XPLOR9 server or build pipeline.

## 2. Key finding: the book frame gives no isolation

foliate-js renders pages in `<iframe sandbox="allow-same-origin allow-scripts">` (WebKit bug workaround).
**Verified:** code running inside a book page can read the XPLOR9 page, all localStorage keys, list and
read IndexedDB (`xplor9-reading`: progress readable) and remove its own `sandbox` attribute.
So any script that executes in a book page has full access to user data. Everything depends on no
script ever running there.

## 3. Results of the malicious corpus

| Vector | Before this review | After hardening (this commit) |
|---|---|---|
| Inline `<script>`, `on*` handlers, `javascript:` href (R2 fixture) | Removed by sanitiser | Removed |
| `java<TAB>script:` / `java<NEWLINE>script:` links | **Survived sanitiser** (did not run only because foliate cancels link clicks) | Removed (browser-style URL normalisation) |
| SVG `xlink:href="javascript:"` | Removed | Removed |
| Form posting to a remote site | Blocked by sandbox (no `allow-forms`) | Blocked by sandbox + CSP `form-action 'none'` |
| `target="_top"` link | Did not navigate | Did not navigate |
| Remote image, CSS, `@import`, font, CSS background, autoplay audio/video | **All 7 loaded** (tracking/privacy leak) | **All 7 blocked by CSP** (0 reached the network) |
| XSLT stylesheet generating `<script>` | Not applied by Chromium | Not applied; script would be blocked by CSP |
| HTML mutation-XSS patterns (noscript, svg/style, math/mglyph, nested form) | None executed | None executed |
| Script element / `javascript:` URL injected into a rendered page (simulates a sanitiser miss) | Would run (no second layer) | **Blocked by CSP** |
| Saved position not present in the book | **Blank reader, no error** | Opens at start with a notice |

Hardening shipped with this review (no new dependencies, reader architecture unchanged):
1. `isUnsafeUrl()` normalises tabs/newlines/control characters before checking the scheme.
2. A Content Security Policy `<meta>` is inserted as the first element of every book page:
   `default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none';
   connect-src 'none'; form-action 'none'; base-uri 'none'; img-src blob: data: 'self';
   media-src blob: 'self'; style-src 'unsafe-inline' blob: 'self'; font-src blob: data: 'self'`.
   Verified: 0 CSP violations during normal reading (fonts incl. Kannada, themes, search, bookmarks,
   contents, tap zones).
3. Recovery when a saved CFI no longer resolves.

## 4. Remaining vulnerabilities (severity for R4 imports)

| ID | Issue | Severity | Notes |
|---|---|---|---|
| V1 | Book frame is same-origin with scripts allowed; any execution = full data access | **High** | Now two browser-enforced layers (sanitiser + CSP). Isolation would remove the impact entirely. |
| V2 | Sanitiser is a deny-list | Medium | CSP backs it up for script and network; allow-list recommended for imports. |
| V3 | No limits on ZIP size, entry count, declared/actual decompressed size; decompression on main thread | **High for imports** | See section 6 measurements. |
| V4 | Meta CSP only covers documents with `<html>`; standalone SVG pages rely on the sanitiser | Low | Sanitiser removes script/handlers/animation in SVG. |
| V5 | Search parses pages with `createDocument()` without the sanitiser | Low | DOMParser documents are inert (no script, no loads). |
| V6 | WebKit/Safari and Firefox behaviour unverified (XSLT, CSP-in-blob documents) | Medium | Must be tested before R4 ships. |
| V7 | PDF.js runs in the XPLOR9 page/worker, not in a sandbox | Medium–High | See section 7. |

## 5. Recommended architecture for safe personal imports

Layered; each layer independently stops the attacks it targets.

1. **Validate before render** (new import step): size cap (e.g. 100 MB EPUB, 300 MB PDF), ZIP checks
   from the central directory (entry count ≤ 10,000; declared total uncompressed ≤ 500 MB; per-entry
   ≤ 50 MB; ratio ≤ 100:1), mimetype/container/OPF parse, then enforce *actual* decompressed bytes while
   reading (abort past the cap). Run unzip in a Web Worker so a bad file can't freeze the page.
2. **Allow-list sanitising for imported books**: DOMPurify 3.5.x (MPL-2.0/Apache-2.0, maintained) with
   an EPUB profile (XHTML + SVG + MathML, no script/foreignObject handlers), keeping our deny-list and URL
   normalisation as a second pass. Catalogue books keep the current path.
3. **CSP inside every book page** (done in this review).
4. **Isolation for imported books (recommended before R4 ships)**: render imports in a separate origin
   (e.g. a dedicated reader subdomain served by the same deployment). Even a total sanitiser + CSP failure
   then cannot reach XPLOR9's IndexedDB/localStorage. The import file is handed over with postMessage
   (transferable ArrayBuffer); progress/bookmarks come back the same way. Alternative if a second origin
   isn't practical: patch foliate to drop `allow-scripts` on Chromium/Firefox (needs WebKit testing first).
5. **Storage**: imported files stored in IndexedDB keyed by SHA-256; never uploaded; quota checks via
   `navigator.storage.estimate()`; `persist()` requested with user-visible explanation.

## 6. ZIP bomb and malformed-file measurements

Measured in Chromium against the production build (hard timeouts enforced outside the page):

| File | Result |
|---|---|
| `zip-bomb-150mb.epub` (151 KB → 150 MB text) | **Page unresponsive from ~8 s, JS heap 456 MB at 13 s, still frozen at 60 s; no error shown.** Tab could be closed. A first, unbounded test run hung the automation browser for 30 minutes. |
| `many-entries.epub` (20,000 files) | Rendered in 1.4 s; longest stall 0.2 s |
| `not-a-zip.epub` | Error in 0.6 s: "File type not supported" |
| `truncated.epub` | Error in 0.4 s: "End of central directory not found" (raw library text) |
| `broken-opf.epub` | Error in 0.6 s: raw XML parser text |

Conclusions: decompression limits and off-main-thread unzip are required before imports (V3); error
messages for malformed files need plain-language wording.

## 7. PDF.js

- Use `pdfjs-dist` ≥ 6.2.108 (CVE-2026-16633: arbitrary JavaScript when scripting enabled and no
  script CSP; fixed in 6.2.108). Historic CVE-2024-4367 (fixed 4.2.67) is still exploited against old
  copies. Current release 6.5.438.
- Options: `isEvalSupported: false`, `enableScripting: false`, no XFA, `externalLinkTarget` blank with
  `rel=noopener noreferrer`, link annotations filtered to http(s).
- Run the PDF viewer inside the same isolated origin as imported EPUBs (section 5.4) so a PDF.js bug
  can't reach XPLOR9 data. Cap page count/size; render lazily.

## 8. Test plan for R4 (must pass before release)

Corpus: `test-fixtures/security/*.epub` (+ PDF corpus to add: JavaScript action, launch action,
`javascript:` link annotation, malformed xref, huge page count, font-matrix payload as in CVE-2024-4367).
For each file, in Chromium, Firefox and WebKit:
1. No payload executes (`window.__xplor9_attack` empty), storage untouched, no network requests to
   external hosts (check at the network layer, not only browser request events).
2. Malformed/bomb files show a clear error within 5 s; the page stays responsive; no tab crash.
3. Regression: catalogue reading, search, bookmarks, fonts (incl. Indic), themes, radio playback.
