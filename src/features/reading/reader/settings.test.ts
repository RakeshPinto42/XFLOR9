import { describe, expect, it } from "vitest";
import { inProgress, parseProgress } from "../storage/readingDb";
import { THEMES, bookStylesheet, clampFontScale, parseSettings } from "./settings";

describe("reader settings", () => {
  it("clamps text size to 80–200% in steps of 10", () => {
    expect(clampFontScale(55)).toBe(80);
    expect(clampFontScale(250)).toBe(200);
    expect(clampFontScale(124)).toBe(120);
    expect(clampFontScale(Number.NaN)).toBe(100);
  });

  it("validates saved settings", () => {
    expect(parseSettings({ theme: "dark", fontScale: 140 })).toEqual({ theme: "dark", fontScale: 140 });
    expect(parseSettings({ theme: "neon", fontScale: "big" })).toEqual({ theme: "light", fontScale: 100 });
    expect(parseSettings(null)).toEqual({ theme: "light", fontScale: 100 });
  });

  it("uses absolute font URLs (relative URLs can't resolve inside blob: book pages)", () => {
    const css = bookStylesheet({ theme: "light", fontScale: 100 }, "https://xplor9.test");
    expect(css).not.toContain('url("/fonts/');
    expect(css.match(/url\("https:\/\/xplor9\.test\/fonts\/reader\/[\w-]+\.woff2"\)/g)).toHaveLength(6);
  });

  it("injects theme colours, text size and the Indian-script fonts", () => {
    const css = bookStylesheet({ theme: "warm", fontScale: 150 }, "https://xplor9.test");
    expect(css).toContain(`background: ${THEMES.warm.bg}`);
    expect(css).toContain(`color: ${THEMES.warm.text}`);
    expect(css).toContain("font-size: 150%");
    expect(css).toMatch(/font-family: "Noto Serif Kannada"[\s\S]*kannada-400\.woff2/);
    expect(css).toMatch(/font-family: "Noto Serif Devanagari"[\s\S]*devanagari-400\.woff2/);
    expect(css).toContain("U+0C80-0CF3"); // Kannada block: only downloaded when used
  });

  it("uses a dark colour scheme only for the dark theme", () => {
    expect(bookStylesheet({ theme: "dark", fontScale: 100 }, "https://x.test")).toContain("color-scheme: dark");
    expect(bookStylesheet({ theme: "light", fontScale: 100 }, "https://x.test")).toContain("color-scheme: light");
  });
});

describe("progress records", () => {
  const ok = { bookKey: "cat:the-time-machine", cfi: "epubcfi(/6/8!/4/2/1:0)", fraction: 0.34, chapter: "IV", updatedAt: 1 };

  it("accepts a valid record and clamps the fraction", () => {
    expect(parseProgress(ok)).toEqual(ok);
    expect(parseProgress({ ...ok, fraction: 7 })?.fraction).toBe(1);
  });

  it("rejects malformed records", () => {
    expect(parseProgress({ ...ok, bookKey: "evil key" })).toBeNull();
    expect(parseProgress({ ...ok, cfi: "javascript:alert(1)" })).toBeNull();
    expect(parseProgress("x")).toBeNull();
  });

  it("lists only started, unfinished books for Continue reading", () => {
    const recs = [0, 0.4, 0.999].map((fraction, i) => ({ ...ok, bookKey: `cat:b${i}`, fraction }));
    expect(inProgress(recs).map((r) => r.bookKey)).toEqual(["cat:b1"]);
  });
});
