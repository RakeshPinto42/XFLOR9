# Personal imports: security foundation

Date: 2026-11-23. Follows the pre-R4 review in [epub-reader.md](epub-reader.md).
Scope: the isolation, validation and test machinery for reading the user's own EPUB/PDF files.
**Not in scope (not built yet):** the import UI, storing imported files, the PDF reader.
**Personal imports are NOT declared safe.** See "Release conditions" below.

## Architecture

Two origins. Browsers keep storage, DOM and scripts of different origins apart.

| | Main origin (XPLOR9) | Reader origin |
|---|---|---|
| Local dev | `http://localhost:<port>` | `http://127.0.0.1:<port>` (same server, different origin) |
| Production | `NEXT_PUBLIC_XPLOR9_ORIGIN` | `NEXT_PUBLIC_XPLOR9_READER_ORIGIN` |
| Holds user data (IndexedDB, localStorage) | yes | **no, never** |
| Renders imported files | no | yes, at `/isolated/reader` |

Production with either variable missing, or both equal: imports are **disabled** (fail closed).
Recommended production reader origin: a separate registrable domain, not a subdomain.

### Data flow (EPUB)

```
User picks file (main origin)
  │  size check (≤100 MB); bytes read locally. Never uploaded.
  ▼
postMessage "open"  ──to exact reader origin only, ArrayBuffer transferred──▶  /isolated/reader (iframe)
                                                                                  │ checks: event.origin === main origin
                                                                                  │         event.source === window.parent
                                                                                  │         strict message schema
                                                                                  ▼
                                                                            Web Worker (zip.worker.ts)
                                                                              fflate streaming unzip
                                                                              counts REAL decompressed bytes
                                                                              limits → error code, or files
                                                                              killed after 20 s
                                                                                  ▼
                                                                            foliate EPUB parser (custom loader:
                                                                              no unzip on the page thread)
                                                                                  ▼
                                                                            every HTML/SVG page:
                                                                              1. DOMPurify allow-list
                                                                              2. XPLOR9 sanitiser (deny-list, URLs)
                                                                              3. page CSP meta (script-src 'none' …)
                                                                                  ▼
                                                                            blob: page frame (reader origin)
  ◀── postMessage "opened" / "relocated" / "error" (validated: fixed codes, CFI pattern, lengths) ──┘
Main origin shows XPLOR9's own messages, never text from the reader.
```

### Layers and what each one stops

1. **Separate origin**: book code can't read XPLOR9 storage or DOM, even if every other layer fails.
2. **`frame-ancestors 'self' <main origin>`** (HTTP header on `/isolated/*`): no other site can embed the reader. `'self'` is required because book pages are `blob:` documents that inherit the header. WebKit enforces this, and without `'self'` it refused every book page.
3. **The reader refuses to run** at top level or on any origin other than the configured reader origin.
4. **Strict `postMessage`**: exact origin + exact window + exact fields (no extras), validated types, request IDs. Never `*`.
5. **Worker ZIP validation**: limits are enforced on bytes actually produced, so lying headers don't help an attacker.
6. **DOMPurify** (imports only) → **XPLOR9 sanitiser** → **page CSP**: catalogue books keep using layers 2 and 3 as before.
7. **iframe sandbox** on the reader frame: no top navigation, forms, downloads or modals. Popups are only for user-clicked http(s) links (`noopener`).
8. **Fail-safe**: an uncaught rendering error, or no result within 20 s, becomes a clean "couldn't be read" error.

### Limits (`src/features/imports/limits.ts`)

| Limit | Value |
|---|---|
| EPUB file size | 100 MB |
| Files inside | 10,000 (checked from the central directory first, then counted for real) |
| Decompressed size per file | 50 MB (real bytes) |
| Decompressed total | 300 MB (real bytes) |
| Compression ratio per file | ≤100× (files under 64 KB compressed exempt) |
| Path names | relative only; no `..`, `.`, `\`, drive letters, control characters; ≤512 chars; no duplicates |
| Worker / open time | 20 s each |
| PDF file size (future) | 300 MB |

## Dependencies (pinned exactly)

| Package | Version | Why |
|---|---|---|
| `dompurify` | 3.5.0 | Allow-list sanitising of imported pages |
| `fflate` | 0.8.3 | Streaming unzip with byte counting (moved from dev to runtime dependency) |
| `@playwright/test` (dev) | 1.65.1 | Cross-browser security and regression suites |
| Browsers tested | Chromium 159.0.8154.6, Firefox 159.0, WebKit 27.2 | Installed by `npx playwright install` |
| `foliate-js` (existing) | 1.0.1 | Its `EPUB` class is now also used with a custom loader |
| `pdfjs-dist` (future) | ≥ 6.2.108 required | Not installed yet. See epub-reader.md §7 |

## Tests

| Suite | Command | What |
|---|---|---|
| Unit | `npm test` | ZIP limits incl. lying headers, stack-overflow regression, paths; message validators; origin pairing; PDF corpus structure |
| Security (3 browsers) | `npm run test:security` | Builds with the test-only harness into `.next-security/`, port 3010 |
| Regression (3 browsers) | `npm run test:regression` | Normal build, port 3011: harness absent, Reading Room, radio page |

Corpora (git-ignored, regenerated by the suite): `test-fixtures/security/*.epub`,
`test-fixtures/security/pdf/*.pdf` + `manifest.json` (expected outcome per file).

The test harness page (`/reading/isolation-harness`) exists only when built with
`NEXT_PUBLIC_XPLOR9_SECURITY_HARNESS=1`. The regression suite checks that it is absent otherwise.

## Release conditions for personal imports (all must pass)

| # | Condition | Status |
|---|---|---|
| 1 | Separate-origin isolation, strict messaging, frame-ancestors | Done, tested in 3 browsers |
| 2 | Real-byte ZIP limits in a Worker; malformed files fail cleanly | Done, tested in 3 browsers |
| 3 | DOMPurify + sanitiser + CSP on imported pages | Done, tested in 3 browsers |
| 4 | Import UI: local-only storage of files (main origin IndexedDB), storage usage, deletion, quota warnings | **Not built** |
| 5 | Saving reading position from the reader (protocol exists; not wired to storage) | **Not built** |
| 6 | Compatibility corpus of real third-party EPUBs (EPUB 2/3, Indic, images, fixed layout) | **Not done**: only catalogue books tested |
| 7 | PDF reader: PDF.js ≥ 6.2.108 inside the reader origin; whole PDF corpus passes in 3 browsers | **Not built** (corpus ready) |
| 8 | Production reader origin configured and verified on the real hosting | **Not done** |
| 9 | Low-memory device check (300 MB decompressed limit held in memory) | **Not done** |

## Known limitations

- The reader page needs `script-src 'unsafe-inline'` because Next.js starts pages with inline scripts. Book pages have their own stricter CSP (`script-src 'none'`), and the reader origin holds no data.
- Chapters that are bare SVG documents can't be laid out by foliate. Such books fail cleanly with "couldn't be read".
- The PDF corpus is checked structurally only (no PDF parser installed). It will be validated against PDF.js when the PDF reader is built.
- The extracted book is held in memory, up to 300 MB.
