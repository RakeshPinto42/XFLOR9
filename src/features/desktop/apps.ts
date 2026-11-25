import type { Size } from "./windows";

/**
 * Every application on the desktop: the icon, start menu and taskbar all read from here.
 * Components live in AppWindows.tsx (loaded on demand); this file is plain data.
 */

export type AppId = "radio" | "tv" | "music" | "video" | "games" | "reading" | "notepad" | "control";

export interface DesktopApp {
  id: AppId;
  title: string;
  /** One line for the start menu. */
  blurb: string;
  size: Size;
  min: Size;
  /** Shown as a desktop icon (system tools only appear in the start menu). */
  onDesktop: boolean;
}

export const APPS: readonly DesktopApp[] = [
  { id: "radio", title: "Radio", blurb: "Live stations from India and the world", size: { w: 780, h: 620 }, min: { w: 340, h: 320 }, onDesktop: true },
  { id: "tv", title: "Television", blurb: "Classic Indian TV and silent-era films", size: { w: 820, h: 640 }, min: { w: 360, h: 320 }, onDesktop: true },
  { id: "music", title: "Music", blurb: "Film songs and India's first records", size: { w: 820, h: 640 }, min: { w: 360, h: 320 }, onDesktop: true },
  { id: "video", title: "Video", blurb: "Official channels on YouTube", size: { w: 900, h: 620 }, min: { w: 360, h: 340 }, onDesktop: true },
  { id: "games", title: "Games", blurb: "Saanp and Mines", size: { w: 680, h: 640 }, min: { w: 340, h: 360 }, onDesktop: true },
  { id: "reading", title: "Reading Room", blurb: "Public-domain books and your own files", size: { w: 960, h: 680 }, min: { w: 360, h: 360 }, onDesktop: true },
  { id: "notepad", title: "Notepad", blurb: "Notes kept in this browser", size: { w: 560, h: 440 }, min: { w: 280, h: 200 }, onDesktop: true },
  { id: "control", title: "Control Panel", blurb: "Wallpaper, colours, sound and name", size: { w: 620, h: 520 }, min: { w: 320, h: 320 }, onDesktop: false },
];

export const APP_BY_ID = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, DesktopApp>;

export function isAppId(v: unknown): v is AppId {
  return typeof v === "string" && Object.hasOwn(APP_BY_ID, v);
}
