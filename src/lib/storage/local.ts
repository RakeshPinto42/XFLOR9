/**
 * Local-first storage. Everything XPLOR9 remembers lives in this browser only.
 * localStorage can throw (private mode, blocked storage), so every access is guarded
 * and callers get a safe fallback instead of a crash.
 */

const PREFIX = "xplor9.";

export const STORAGE_KEYS = {
  introSeen: `${PREFIX}introSeen`,
  playbackPrefs: `${PREFIX}playbackPrefs`,
  radioFavourites: `${PREFIX}radio.favourites`,
  radioRecents: `${PREFIX}radio.recents`,
  radioPrefs: `${PREFIX}radio.prefs`,
  readerSettings: `${PREFIX}reader.settings`,
} as const;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
