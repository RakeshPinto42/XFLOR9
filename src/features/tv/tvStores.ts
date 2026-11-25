"use client";

import { addRecentId, MAX_FAVOURITES, MAX_RECENTS, parseIdList, toggleId } from "@/features/media/library";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";

/** TV's remembered data (programme ids). All of it stays in this browser. */
export const tvFavourites = createLocalStore<string[]>(STORAGE_KEYS.tvFavourites, [], (raw) => parseIdList(raw, MAX_FAVOURITES));
export const tvRecents = createLocalStore<string[]>(STORAGE_KEYS.tvRecents, [], (raw) => parseIdList(raw, MAX_RECENTS));

export const toggleTvFavourite = (id: string) => tvFavourites.set((list) => toggleId(list, id));
export const recordTvWatch = (id: string) => tvRecents.set((list) => addRecentId(list, id));
