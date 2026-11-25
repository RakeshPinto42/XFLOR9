/**
 * Desktop personalisation, remembered in this browser: colour scheme, wallpaper, the name on the
 * welcome screen, and whether the computer makes its system sounds. Volume lives in the shared
 * sound settings (src/lib/sound), so the radio and the system sounds follow one master volume.
 */

export const THEMES = {
  blue: "Blue",
  olive: "Olive green",
  silver: "Silver",
  glass: "Glass",
} as const;
export type ThemeId = keyof typeof THEMES;

export const WALLPAPERS = {
  hills: { name: "Green hills", kind: "art" },
  monsoon: { name: "Monsoon lane", kind: "image", src: "/wallpapers/monsoon-lane.webp" },
  aurora: { name: "Aurora", kind: "art" },
  dusk: { name: "Dusk over the city", kind: "art" },
  teal: { name: "Plain teal", kind: "colour" },
  navy: { name: "Plain navy", kind: "colour" },
} as const;
export type WallpaperId = keyof typeof WALLPAPERS;

export interface DesktopPrefs {
  theme: ThemeId;
  wallpaper: WallpaperId;
  /** Shown on the welcome screen and at the top of the start menu. */
  userName: string;
  systemSounds: boolean;
  /** The full start-up (memory check, logo) has been seen once; later visits start quicker. */
  bootSeen: boolean;
}

export const DEFAULT_DESKTOP_PREFS: DesktopPrefs = {
  theme: "blue",
  wallpaper: "hills",
  userName: "Guest",
  systemSounds: true,
  bootSeen: false,
};

export const MAX_NAME = 24;

/** A display name: printable characters only, trimmed, at most MAX_NAME long; empty → Guest. */
export function cleanName(v: unknown): string {
  if (typeof v !== "string") return DEFAULT_DESKTOP_PREFS.userName;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, MAX_NAME);
  return s || DEFAULT_DESKTOP_PREFS.userName;
}

export function parseDesktopPrefs(raw: unknown): DesktopPrefs {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_DESKTOP_PREFS;
  return {
    theme: typeof r.theme === "string" && Object.hasOwn(THEMES, r.theme) ? (r.theme as ThemeId) : d.theme,
    wallpaper: typeof r.wallpaper === "string" && Object.hasOwn(WALLPAPERS, r.wallpaper) ? (r.wallpaper as WallpaperId) : d.wallpaper,
    userName: cleanName(r.userName),
    systemSounds: r.systemSounds !== false,
    bootSeen: r.bootSeen === true,
  };
}
