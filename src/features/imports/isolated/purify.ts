import DOMPurify from "dompurify";

/**
 * Allow-list sanitising for IMPORTED books (DOMPurify 3.5.0, pinned). Keeps only known-safe
 * HTML/SVG/MathML; everything else is dropped. Runs before XPLOR9's own sanitiser, which then
 * adds the page CSP. Catalogue books don't use this path.
 *
 * The page is parsed by the browser with its real type (XHTML/SVG documents start with an XML
 * declaration, which DOMPurify's own string parsing rejects), cleaned in place, and serialised
 * as XML so the next layer can parse it again with the same type.
 */

// Relative links, blob: (book resources after foliate rewrites them), http(s) and mailto only.
const ALLOWED_URI = /^(?:(?:https?|mailto|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const SVG_NS = "http://www.w3.org/2000/svg";
const EMPTY_SVG = `<svg xmlns="${SVG_NS}"/>`;

const CONFIG = {
  IN_PLACE: true,
  // Only affects how tag names are compared with the allow-list (case-insensitively).
  PARSER_MEDIA_TYPE: "text/html" as const,
  ALLOWED_URI_REGEXP: ALLOWED_URI,
  ALLOW_DATA_ATTR: false,
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  // Document structure + book stylesheets (already rewritten to blob: URLs by foliate).
  ADD_TAGS: ["html", "head", "body", "title", "link", "style"],
  ADD_ATTR: ["rel", "href", "type", "lang", "xml:lang"],
  FORBID_TAGS: ["script", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "meta", "form", "input", "button", "textarea", "select", "portal", "noscript"],
  FORBID_ATTR: ["srcdoc", "action", "formaction", "ping"],
  KEEP_CONTENT: true,
};

export function purifyBookMarkup(markup: string, type: string): string {
  if (type !== "application/xhtml+xml" && type !== "text/html" && type !== "image/svg+xml") return markup;
  const doc = new DOMParser().parseFromString(markup, type);
  const root = doc.documentElement;
  const isSvg = type === "image/svg+xml";
  // Unparseable or wrong root: render nothing rather than whatever the browser's error page holds.
  if (!root || doc.getElementsByTagName("parsererror").length > 0) return isSvg ? EMPTY_SVG : "<html><body></body></html>";
  if (isSvg && root.namespaceURI !== SVG_NS) return EMPTY_SVG;
  DOMPurify.sanitize(root, isSvg ? { ...CONFIG, NAMESPACE: SVG_NS } : CONFIG);
  return new XMLSerializer().serializeToString(doc);
}
