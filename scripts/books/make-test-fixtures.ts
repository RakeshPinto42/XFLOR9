/**
 * Builds two TEST-ONLY EPUBs (never part of the catalogue) used by browser checks:
 *   test-fixtures/indic-sample.epub  Kannada, Devanagari and English chapters with conjuncts,
 *                                     written for XPLOR9 (no third-party text)
 *   test-fixtures/malicious.epub     tries inline scripts, event handlers, javascript: links,
 *                                     embedded frames and meta refresh; the reader must block all
 * Usage: node scripts/books/make-test-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { strToU8, zipSync, type Zippable } from "fflate";

const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

function epub(title: string, lang: string, chapters: { id: string; title: string; lang: string; body: string }[]) {
  const manifest = chapters.map((c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = chapters.map((c) => `<itemref idref="${c.id}"/>`).join("");
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:xplor9:test:${title}</dc:identifier><dc:title>${title}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">2026-11-23T00:00:00Z</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest>
<spine>${spine}</spine></package>`;
  const nav = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${chapters
    .map((c) => `<li><a href="${c.id}.xhtml">${c.title}</a></li>`)
    .join("")}</ol></nav></body></html>`;
  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(container),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(nav),
  };
  for (const c of chapters) {
    files[`OEBPS/${c.id}.xhtml`] = strToU8(
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${c.lang}" lang="${c.lang}"><head><title>${c.title}</title></head>${c.body}</html>`,
    );
  }
  return zipSync(files, { mtime: new Date("2026-11-23T00:00:00Z") });
}

const repeat = (p: string, n: number) => Array.from({ length: n }, () => `<p>${p}</p>`).join("");

const kannada = "ಕನ್ನಡ ನಾಡಿನ ಶ್ರೀಮಂತ ಕಥೆಗಳು ಮಕ್ಕಳಿಗೆ ಪ್ರಿಯ. ಕ್ಷಮಿಸಿ, ಈ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರ ದ್ವಾರದ ಬಳಿ ಇದೆ. ಸ್ನೇಹಿತರು ಸಂಜೆ ಕ್ರಿಕೆಟ್ ಆಡುತ್ತಾರೆ.";
const hindi = "हिन्दी की कहानियाँ बच्चों को प्रिय हैं। क्षत्रिय राजा श्रीमान विक्रम द्वार पर खड़े थे। शुद्ध हृदय से प्रश्न पूछो।";
const english = "This chapter is plain English text used to check that page turns, the contents list and saved progress work across chapters.";

mkdirSync("test-fixtures", { recursive: true });
writeFileSync(
  "test-fixtures/indic-sample.epub",
  epub("XPLOR9 Indic sample", "kn", [
    { id: "kn", title: "ಕನ್ನಡ ಅಧ್ಯಾಯ", lang: "kn", body: `<body><h1>ಕನ್ನಡ ಅಧ್ಯಾಯ</h1><p id="kn-probe">ಕ್ಷ ಶ್ರೀ ಪ್ರ ದ್ವ</p>${repeat(kannada, 30)}</body>` },
    { id: "hi", title: "हिन्दी अध्याय", lang: "hi", body: `<body><h1>हिन्दी अध्याय</h1><p id="hi-probe">क्ष श्री प्र द्ध</p>${repeat(hindi, 30)}</body>` },
    { id: "en", title: "English chapter", lang: "en", body: `<body><h1>English chapter</h1>${repeat(english, 30)}</body>` },
  ]),
);

const attack = "window.parent.__xplor9_attack=(window.parent.__xplor9_attack||[]).concat";
writeFileSync(
  "test-fixtures/malicious.epub",
  epub("XPLOR9 malicious test", "en", [
    {
      id: "attack",
      title: "Attack chapter",
      lang: "en",
      body: `<body onload="${attack}('body-onload')">
<meta http-equiv="refresh" content="0;url=https://example.com/"/>
<h1>Security test</h1>
<script>${attack}('inline-script'); try { window.parent.localStorage.setItem('xplor9.pwned','1') } catch (e) {}</script>
<p><img src="does-not-exist.png" alt="broken" onerror="${attack}('img-onerror')"/></p>
<p><a id="js-link" href="javascript:${attack}('javascript-link')">A javascript: link</a></p>
<p><a id="ext-link" href="https://example.com/">An external link</a></p>
<iframe srcdoc="&lt;script&gt;parent.parent.__xplor9_attack=['iframe-srcdoc']&lt;/script&gt;"></iframe>
<p>If the reader is safe, none of the above ran.</p></body>`,
    },
  ]),
);
console.log("Wrote test-fixtures/indic-sample.epub and test-fixtures/malicious.epub");
