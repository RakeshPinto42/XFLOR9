"use client";

import { addRecentId, MAX_FAVOURITES, MAX_RECENTS, parseIdList, toggleId } from "@/features/media/library";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";
import { EMPTY_LIBRARY, parseLibrary, type MusicLibrary } from "./library";

/** Music's remembered data (track ids). All of it stays in this browser. */
export const musicFavourites = createLocalStore<string[]>(STORAGE_KEYS.musicFavourites, [], (raw) => parseIdList(raw, MAX_FAVOURITES));
export const musicRecents = createLocalStore<string[]>(STORAGE_KEYS.musicRecents, [], (raw) => parseIdList(raw, MAX_RECENTS));

/** Saved playlists and videos added from Video and TV (see library.ts). Video and TV write here too. */
export const musicLibrary = createLocalStore<MusicLibrary>(STORAGE_KEYS.musicLibrary, EMPTY_LIBRARY, parseLibrary);

export const toggleMusicFavourite = (id: string) => musicFavourites.set((list) => toggleId(list, id));
export const recordMusicPlay = (id: string) => musicRecents.set((list) => addRecentId(list, id));
