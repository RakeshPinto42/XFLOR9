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
const UNSAFE_URL = /^\s*(javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*image\/svg)/i;

export function isMarkupType(type: string): boolean {
  return MARKUP_TYPES.has(type);
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
      else if ((URL_ATTRIBUTES.includes(name) || name.endsWith(":href")) && UNSAFE_URL.test(attr.value))
        el.removeAttribute(attr.name);
      else if (name === "srcdoc") el.removeAttribute(attr.name);
    }
  }

  return asHtml
    ? `<!DOCTYPE html>${doc.documentElement.outerHTML}`
    : new XMLSerializer().serializeToString(doc);
}
