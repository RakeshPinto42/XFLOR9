import { describe, expect, it } from "vitest";
import { DEFAULT_DESKTOP_PREFS, MAX_NAME, cleanName, parseDesktopPrefs } from "./prefs";

describe("desktop preferences", () => {
  it("falls back field by field for old or corrupted settings", () => {
    expect(parseDesktopPrefs(null)).toEqual(DEFAULT_DESKTOP_PREFS);
    expect(parseDesktopPrefs({ theme: "neon", wallpaper: "monsoon", systemSounds: false, bootSeen: "yes" })).toEqual({
      ...DEFAULT_DESKTOP_PREFS,
      wallpaper: "monsoon",
      systemSounds: false,
    });
  });

  it("does not accept inherited object keys as a theme", () => {
    expect(parseDesktopPrefs({ theme: "constructor" }).theme).toBe("blue");
  });

  it("cleans the display name", () => {
    expect(cleanName("  Rakesh  ")).toBe("Rakesh");
    expect(cleanName("a\u0000b\nc")).toBe("abc");
    expect(cleanName("   ")).toBe("Guest");
    expect(cleanName(42)).toBe("Guest");
    expect(cleanName("x".repeat(100))).toHaveLength(MAX_NAME);
  });
});
