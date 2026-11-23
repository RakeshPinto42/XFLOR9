# EPUB reader security notes

Status: open concern, tracked. A separate security review is required **before R4** (personal imports).

## The concern

foliate-js (1.0.1) renders each book page in an iframe with
`sandbox="allow-same-origin allow-scripts"` (needed for a WebKit event bug, see
`node_modules/foliate-js/paginator.js`). Chrome warns that this combination can escape the
sandbox: script inside a book page would run with XPLOR9's origin, with access to the page,
localStorage and IndexedDB. foliate-js blocks external script *files* (`allowScript = false`)
but leaves inline scripts and event-handler attributes (marked TODO in `epub.js`).

## Current mitigation (R2)

- `src/features/reading/reader/sanitize.ts` runs on every (X)HTML/SVG page via
  `book.transformTarget` before it becomes a blob URL. It removes script, iframe/frame,
  object/embed/applet, base, meta http-equiv, portal and SVG animation elements; all `on*`
  attributes; `srcdoc`; and javascript:/vbscript:/data:text-html/data:image-svg URLs.
- External links open only for http(s), with `noopener,noreferrer`.
- Catalogue books are verified files (SHA-256 checked before opening) with no scripts.
- Browser-verified with `test-fixtures/malicious.epub` (inline script, onload, onerror,
  javascript: link, srcdoc iframe, meta refresh): nothing ran, storage untouched,
  `window.opener` null on external links.

## Known gaps

- Single layer of defence: no Content Security Policy. A nonce-based CSP conflicts with
  Next.js Cache Components static pre-rendering; `'unsafe-inline'` would also let book scripts run.
- The sanitiser is a deny-list. Deny-lists can miss new vectors.
- `book.sections[i].createDocument()` (used by search) parses pages with DOMParser; parsing
  alone doesn't execute scripts, but this path doesn't go through the sanitiser.

## To decide in the pre-R4 review (untrusted user files)

1. Isolation: render imported books from a separate origin (e.g. a sandboxed subdomain or
   a sandboxed iframe *without* allow-same-origin plus postMessage), so a missed vector can't
   reach XPLOR9's storage.
2. Sanitisation: allow-list approach (e.g. a maintained sanitiser such as DOMPurify) instead
   of the current deny-list, plus SVG-specific rules.
3. CSP alternatives: CSP via `<meta http-equiv>` injected into each book page document, or a
   response-header CSP on a dedicated reader route that is rendered dynamically.
4. Resource limits for imports: size caps, zip-bomb protection (uncompressed size, entry
   count), and validation of the OPF before rendering.
5. A broader malicious-EPUB test corpus (SVG script, MathML, CSS-based attacks, encoded URLs).
