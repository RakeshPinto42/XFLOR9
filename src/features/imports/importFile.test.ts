import { describe, expect, it } from "vitest";
import { ImportError } from "./limits";
import { checkFile, formatBytes, formatFromName, sniffFormat } from "./importFile";

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const named = (content: string, name: string) => Object.assign(new Blob([bytes(content)]), { name });
const codeOf = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ImportError ? e.code : String(e)));

describe("sniffFormat", () => {
  it("recognises EPUB (ZIP) and PDF headers", () => {
    expect(sniffFormat(bytes("PK\x03\x04rest"))).toBe("epub");
    expect(sniffFormat(bytes("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffFormat(bytes("junk before %PDF-1.4"))).toBe("pdf");
  });
  it("rejects anything else", () => {
    expect(sniffFormat(bytes("<html><script>"))).toBeNull();
    expect(sniffFormat(bytes(""))).toBeNull();
  });
});

describe("checkFile", () => {
  it("accepts matching name and content", async () => {
    expect(await checkFile(named("PK\x03\x04x", "Book.EPUB"))).toBe("epub");
    expect(await checkFile(named("%PDF-1.7", "doc.pdf"))).toBe("pdf");
  });
  it("rejects wrong extension, mismatched content and empty files", async () => {
    expect(await codeOf(checkFile(named("PK\x03\x04", "book.zip")))).toBe("unsupported");
    expect(await codeOf(checkFile(named("<html>", "evil.pdf")))).toBe("not-zip");
    expect(await codeOf(checkFile(named("%PDF-1.7", "fake.epub")))).toBe("not-zip");
    expect(await codeOf(checkFile(named("", "empty.epub")))).toBe("not-zip");
  });
});

describe("helpers", () => {
  it("formats sizes and detects names", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
    expect(formatFromName("x.pdf")).toBe("pdf");
    expect(formatFromName("x.mobi")).toBeNull();
  });
});
