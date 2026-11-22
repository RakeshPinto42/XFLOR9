"use client";

import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";
import { addRecent, parseFavourites, parseRecents, toggleFavourite, type RecentPlay } from "./library";
import type { Station } from "./types";

/** Radio's remembered data. All of it stays in this browser. */

export type RadioView = "stations" | "favourites" | "recent";

export interface RadioPrefs {
  view: RadioView;
  scope: "IN" | "world";
  language: string | null;
  tag: string | null;
}

const DEFAULT_PREFS: RadioPrefs = { view: "stations", scope: "IN", language: null, tag: null };
const FILTER_VALUE = /^[\p{L}\p{M}\p{N} .&'+\-/]{1,40}$/u;

function parsePrefs(raw: unknown): RadioPrefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  const filter = (v: unknown) => (typeof v === "string" && FILTER_VALUE.test(v) ? v.toLowerCase() : null);
  return {
    view: r.view === "favourites" || r.view === "recent" ? r.view : "stations",
    scope: r.scope === "world" ? "world" : "IN",
    language: filter(r.language),
    tag: filter(r.tag),
  };
}

export const radioPrefs = createLocalStore(STORAGE_KEYS.radioPrefs, DEFAULT_PREFS, parsePrefs);
export const favourites = createLocalStore<Station[]>(STORAGE_KEYS.radioFavourites, [], parseFavourites);
export const recents = createLocalStore<RecentPlay[]>(STORAGE_KEYS.radioRecents, [], parseRecents);

export function toggleFavouriteStation(station: Station) {
  favourites.set((list) => toggleFavourite(list, station));
}

export function recordRecentPlay(station: Station) {
  recents.set((list) => addRecent(list, station, Date.now()));
}

export function clearRecents() {
  recents.set([]);
}
