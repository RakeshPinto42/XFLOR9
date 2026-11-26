import { STORAGE_KEYS } from "@/lib/storage/local";

/**
 * Which app owns each piece of data XPLOR9 keeps, so it can be backed up, restored, measured and
 * cleared app by app. Every key in STORAGE_KEYS belongs to exactly one app (a unit test checks
 * this, so a new setting can't be forgotten by backups). The Reading Room also keeps a database
 * (IndexedDB): progress, bookmarks, favourites, recently opened and imported books.
 */

export type DataAppId = "desktop" | "radio" | "tv" | "music" | "video" | "arcade" | "notepad" | "reading";

export interface DataApp {
  id: DataAppId;
  name: string;
  /** What clearing removes, in the user's words. */
  holds: string;
  keys: readonly string[];
}

const K = STORAGE_KEYS;

export const DATA_APPS: readonly DataApp[] = [
  {
    id: "desktop",
    name: "Desktop and sound",
    holds: "wallpaper, colours, your name, window positions, volume and sound settings",
    keys: [K.desktopPrefs, K.desktopGeometry, K.soundPrefs, K.playbackPrefs, K.introSeen, K.stageQuality],
  },
  { id: "radio", name: "Radio", holds: "favourite stations, presets, recently played and filters", keys: [K.radioFavourites, K.radioRecents, K.radioPrefs, K.radioPresets] },
  { id: "tv", name: "Television", holds: "favourite and recently watched programmes", keys: [K.tvFavourites, K.tvRecents] },
  { id: "music", name: "Music", holds: "the playlist, saved playlists, videos added from Video and TV, favourites, recently played, equaliser and layout", keys: [K.musicFavourites, K.musicRecents, K.musicPlaylist, K.musicEq, K.musicView, K.musicLibrary] },
  { id: "video", name: "Video", holds: "watch history and favourite videos and channels", keys: [K.videoHistory, K.videoFavourites] },
  { id: "arcade", name: "Arcade", holds: "best scores and game settings", keys: [K.gamesBest, K.arcadePrefs] },
  { id: "notepad", name: "Notepad", holds: "your note", keys: [K.notepad] },
  {
    id: "reading",
    name: "Reading Room",
    holds: "reading progress, bookmarks, favourite and recent books, reader settings and imported books",
    keys: [K.readerSettings],
  },
];

export const DATA_APP_IDS = DATA_APPS.map((a) => a.id);

export function dataApp(id: DataAppId): DataApp {
  return DATA_APPS.find((a) => a.id === id)!;
}

export const isDataAppId = (v: unknown): v is DataAppId => typeof v === "string" && (DATA_APP_IDS as string[]).includes(v);
