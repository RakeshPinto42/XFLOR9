import { strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { PDF_FIXTURES, buildPdf } from "./make-pdf-security-fixtures";

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("PDF security corpus", () => {
  it("builds a structurally valid PDF with correct xref offsets", () => {
    const pdf = latin1(buildPdf(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [] /Count 0 >>"]));
    expect(pdf.startsWith("%PDF-1.7")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const rows = pdf.slice(startxref).split("\n").slice(3, 5);
    rows.forEach((row, i) => expect(pdf.slice(Number(row.slice(0, 10)), Number(row.slice(0, 10)) + 7)).toBe(`${i + 1} 0 obj`));
  });

  it("has unique names, a threat description and an expected outcome for every file", () => {
    const names = PDF_FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const f of PDF_FIXTURES) {
      expect(f.threat.length).toBeGreaterThan(20);
      expect(["render-inert", "refuse", "recover-or-refuse"]).toContain(f.expect);
    }
  });

  it.each(PDF_FIXTURES.filter((f) => !/bomb/.test(f.name)).map((f) => [f.name, f] as const))("%s contains its attack", (name, f) => {
    const s = latin1(f.build());
    const marker: Record<string, RegExp> = {
      "js-openaction": /\/S \/JavaScript/,
      "launch-action": /\/S \/Launch/,
      "javascript-uri": /\/URI \(javascript:/,
      "uri-on-open": /\/OpenAction << \/S \/URI/,
      "submit-form": /\/S \/SubmitForm/,
      "remote-goto": /\/S \/GoToR/,
      "fontmatrix-injection": /\/FontMatrix \[1 0 0 1 0 \(0\\\);/,
      "xfa-script": /<script contentType/,
      "embedded-html": /\/EmbeddedFiles/,
      "huge-page-count": /\/Count 2000000000/,
      "recursive-pages": /\/Kids \[2 0 R/,
      "malformed-xref": /startxref\n123456789/,
      "not-a-pdf": /^<html>/,
    };
    if (marker[name]) expect(s).toMatch(marker[name]);
    if (name === "truncated") expect(s).not.toContain("%%EOF");
    if (name === "clean") expect(strFromU8(f.build()).startsWith("%PDF")).toBe(true);
  });
});
