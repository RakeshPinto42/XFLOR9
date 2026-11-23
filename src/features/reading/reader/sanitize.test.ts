import { describe, expect, it } from "vitest";
import { BOOK_PAGE_CSP, bookPageCsp, isUnsafeUrl } from "./sanitize";

describe("isUnsafeUrl", () => {
  it.each([
    "javascript:alert(1)",
    "  javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)", // found in the pre-R4 review: passed the old check
    "java\nscript:alert(1)",
    "java\r\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data: text/html,<x>",
    "data:image/svg+xml,<svg onload=alert(1)>",
  ])("blocks %j", (url) => {
    expect(isUnsafeUrl(url)).toBe(true);
  });

  it.each(["https://example.com/", "chapter2.xhtml#note", "images/map.png", "blob:http://localhost/abc", "data:image/png;base64,AAAA"])(
    "allows %j",
    (url) => {
      expect(isUnsafeUrl(url)).toBe(false);
    },
  );
});

describe("BOOK_PAGE_CSP", () => {
  it("forbids script, network access, forms and embedding", () => {
    for (const directive of [
      "default-src 'none'",
      "script-src 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
    ])
      expect(BOOK_PAGE_CSP).toContain(directive);
  });

  it("only allows images, media and fonts from the book itself or our own origin", () => {
    expect(BOOK_PAGE_CSP).not.toMatch(/https?:/);
    expect(BOOK_PAGE_CSP).not.toContain("*");
  });

  it("names our exact origin for fonts only (Firefox doesn't match 'self' in blob: pages)", () => {
    const csp = bookPageCsp("https://xplor9.example");
    expect(csp).toContain("font-src blob: data: 'self' https://xplor9.example");
    expect(csp.match(/https:\/\/xplor9\.example/g)).toHaveLength(1); // fonts only
    expect(bookPageCsp("http://127.0.0.1:3009")).toContain("font-src blob: data: 'self' http://127.0.0.1:3009");
  });

  it.each(["*", "https://xplor9.example/fonts", "https://a.example; script-src *", "javascript:alert(1)", "https:"])(
    "ignores anything that isn't an exact origin: %s",
    (bad) => expect(bookPageCsp(bad)).toBe(BOOK_PAGE_CSP),
  );
});
