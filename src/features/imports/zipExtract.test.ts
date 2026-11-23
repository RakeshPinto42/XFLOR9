import { strToU8, zipSync, type Zippable } from "fflate";
import { describe, expect, it } from "vitest";
import { EPUB_LIMITS, ImportError } from "./limits";
import { extractEpub, isSafePath } from "./zipExtract";

const base = (): Zippable => ({
  mimetype: [strToU8("application/epub+zip"), { level: 0 }],
  "META-INF/container.xml": strToU8("<container/>"),
});
const zip = (extra: Zippable = {}) => zipSync({ ...base(), ...extra });
const small = { ...EPUB_LIMITS, maxEntryBytes: 1_000_000, maxTotalBytes: 2_000_000, maxEntries: 50 };
const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return "no error";
  } catch (e) {
    return e instanceof ImportError ? e.code : `unexpected: ${String(e)}`;
  }
};

describe("extractEpub", () => {
  it("extracts a valid EPUB", () => {
    const out = extractEpub(zip({ "OEBPS/c1.xhtml": strToU8("<p>hi</p>") }));
    expect([...out.files.keys()].sort()).toEqual(["META-INF/container.xml", "OEBPS/c1.xhtml", "mimetype"]);
  });

  it("rejects files that aren't ZIPs or aren't EPUBs", () => {
    expect(codeOf(() => extractEpub(strToU8("plain text")))).toBe("not-zip");
    expect(codeOf(() => extractEpub(zipSync({ "a.txt": strToU8("x") })))).toBe("not-epub");
    expect(codeOf(() => extractEpub(zipSync({ mimetype: strToU8("application/zip"), "META-INF/container.xml": strToU8("x") })))).toBe("not-epub");
  });

  it("rejects truncated archives", () => {
    const z = zip({ "OEBPS/c.xhtml": strToU8("x".repeat(50_000)) });
    expect(["not-zip", "not-epub"]).toContain(codeOf(() => extractEpub(z.subarray(0, Math.floor(z.length / 2)))));
  });

  it("enforces the file size limit before reading anything", () => {
    expect(codeOf(() => extractEpub(zip(), { ...small, maxFileBytes: 10 }))).toBe("too-large");
  });

  it("stops a zip bomb by actual decompressed bytes (per file)", () => {
    const bomb = zip({ "OEBPS/bomb.xhtml": new Uint8Array(1_500_000) }); // compresses to ~1.5 KB
    expect(codeOf(() => extractEpub(bomb, small))).toBe("entry-too-large");
  });

  it("stops a bomb even when the ZIP header lies about the uncompressed size", () => {
    const bomb = zip({ "OEBPS/bomb.xhtml": new Uint8Array(1_500_000) });
    // Rewrite the declared uncompressed size of every local file header to 10 bytes.
    const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
    for (let i = 0; i + 30 < bomb.length; i++) {
      if (view.getUint32(i, true) === 0x04034b50) view.setUint32(i + 22, 10, true);
    }
    expect(codeOf(() => extractEpub(bomb, small))).toBe("entry-too-large");
  });

  it("enforces the total decompressed size across files", () => {
    const files: Zippable = {};
    for (let i = 0; i < 3; i++) files[`OEBPS/part${i}.xhtml`] = new Uint8Array(900_000);
    expect(codeOf(() => extractEpub(zip(files), small))).toBe("total-too-large");
  });

  it("rejects suspicious compression ratios", () => {
    const limits = { ...small, maxEntryBytes: 10_000_000, maxTotalBytes: 20_000_000, maxCompressionRatio: 100, ratioExemptBelowBytes: 0 };
    expect(codeOf(() => extractEpub(zip({ "OEBPS/z.xhtml": new Uint8Array(5_000_000) }), limits))).toBe("suspicious-compression");
  });

  it("limits the number of files", () => {
    const files: Zippable = {};
    for (let i = 0; i < 60; i++) files[`OEBPS/f${i}.xhtml`] = strToU8("x");
    expect(codeOf(() => extractEpub(zip(files), small))).toBe("too-many-files");
  });

  it("handles thousands of small files without overflowing the stack (regression)", () => {
    const files: Zippable = {};
    for (let i = 0; i < 6_000; i++) files[`OEBPS/f${i}.xhtml`] = strToU8("<p>x</p>");
    expect(extractEpub(zip(files)).files.size).toBe(6_002);
  });

  it("rejects too many files from the directory before decompressing, at the real limit", () => {
    const files: Zippable = {};
    for (let i = 0; i < 10_001; i++) files[`f${i}`] = strToU8("x");
    expect(codeOf(() => extractEpub(zip(files)))).toBe("too-many-files");
  });

  it("rejects unsafe paths", () => {
    expect(codeOf(() => extractEpub(zip({ "../evil.xhtml": strToU8("x") })))).toBe("bad-path");
    expect(codeOf(() => extractEpub(zip({ "/abs.xhtml": strToU8("x") })))).toBe("bad-path");
  });
});

describe("isSafePath", () => {
  it.each(["OEBPS/c1.xhtml", "META-INF/container.xml", "Images/cover image.jpg"])("allows %s", (p) => expect(isSafePath(p)).toBe(true));
  it.each(["../x", "a/../../x", "/etc/passwd", "C:/x", "a\\b", "a/./b", "a\u0000b", ""])("rejects %j", (p) => expect(isSafePath(p)).toBe(false));
});
