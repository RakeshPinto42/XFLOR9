/**
 * Cleans a book page before it is rendered.
 *
 * Why: foliate-js renders pages in an iframe sandboxed with "allow-same-origin allow-scripts"
 * (needed for a WebKit bug), and it only blocks *external* script files. Inline <script>,
 * event-handler attributes and javascript: links would run with access to XPLOR9's page and
 * its saved data. Catalogue books are verified and contain no scripts, but imported books
 * (later step) are untrusted, so every page passes through this function.
 */

const MARKUP_TYPES = new Set(["application/xhtml+xml", "text/html", "image/svg+xml"]);

/** Elements that can run code, load other documents or redirect the page. */
const BLOCKED_ELEMENTS = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "meta[http-equiv]",
  "portal",
  // SVG animation can rewrite an href to javascript: after load
  "set",
  "animate",
  "animatemotion",
  "animatetransform",
  "handler",
  "listener",
];

const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "data", "poster", "background", "xlink:href"];
const UNSAFE_SCHEME = /^(javascript|vbscript|data:text\/html|data:image\/svg)/i;

/**
 * Normalises a URL the way browsers do before reading its scheme: they ignore ASCII tab and
 * newline characters anywhere and leading control characters/spaces. Without this,
 * "java<TAB>script:" passed the check (found in the pre-R4 security review).
 */
export function isUnsafeUrl(value: string): boolean {
  const normalised = value.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "").replace(/\s+/g, "");
  return UNSAFE_SCHEME.test(normalised);
}

/**
 * Content Security Policy placed inside every book page. A second, browser-enforced layer:
 * even if the sanitiser misses something, the page can't run script, can't load anything from
 * the internet (no tracking pixels, remote fonts or autoplay media), can't submit forms and
 * can't embed other documents. Book images are blob: URLs; reader fonts come from our origin.
 */
export const BOOK_PAGE_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "img-src blob: data: 'self'",
  "media-src blob: 'self'",
  "style-src 'unsafe-inline' blob: 'self'",
  "font-src blob: data: 'self'",
].join("; ");

export function isMarkupType(type: string): boolean {
  return MARKUP_TYPES.has(type);
}

const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** Inserts the CSP <meta> as the very first element of <head> (it only applies to what follows it). */
function injectCsp(doc: Document) {
  const root = doc.documentElement;
  if (!root || root.localName !== "html") return; // standalone SVG pages: covered by sanitising only
  // In XHTML documents <head> is a generic Element, not HTMLHeadElement.
  let head: Element | null = doc.querySelector("head");
  if (!head) {
    head = doc.createElementNS(root.namespaceURI ?? XHTML_NS, "head");
    root.insertBefore(head, root.firstChild);
  }
  const meta = doc.createElementNS(root.namespaceURI ?? XHTML_NS, "meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", BOOK_PAGE_CSP);
  head.insertBefore(meta, head.firstChild);
}

export function sanitizeBookMarkup(markup: string, type: string): string {
  if (!isMarkupType(type)) return markup;
  const parser = new DOMParser();
  let doc = parser.parseFromString(markup, type as DOMParserSupportedType);
  let asHtml = type === "text/html";
  if (doc.querySelector("parsererror")) {
    // Not well-formed XML: clean it as HTML instead of passing it through untouched.
    doc = parser.parseFromString(markup, "text/html");
    asHtml = true;
  }

  for (const el of doc.querySelectorAll(BLOCKED_ELEMENTS.join(","))) el.remove();

  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((URL_ATTRIBUTES.includes(name) || name.endsWith(":href")) && isUnsafeUrl(attr.value))
        el.removeAttribute(attr.name);
      else if (name === "srcdoc") el.removeAttribute(attr.name);
    }
  }

  injectCsp(doc); // after removing book-supplied <meta http-equiv>, so ours is the only one

  return asHtml
    ? `<!DOCTYPE html>${doc.documentElement.outerHTML}`
    : new XMLSerializer().serializeToString(doc);
}
