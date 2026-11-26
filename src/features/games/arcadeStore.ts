"use client";

import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";
import { parseArcadePrefs, parseBest, playedGame, recordMinesWin, recordSaanpScore, type Level } from "./scores";

/** The Arcade's remembered best results and settings (this browser only). */
export const bestStore = createLocalStore(STORAGE_KEYS.gamesBest, parseBest(null), parseBest);
export const arcadePrefs = createLocalStore(STORAGE_KEYS.arcadePrefs, parseArcadePrefs(null), parseArcadePrefs);

export const saveSaanpScore = (score: number) => bestStore.set((b) => recordSaanpScore(b, score));
export const saveMinesWin = (level: Level, seconds: number) => bestStore.set((b) => recordMinesWin(b, level, seconds));
export const markPlayed = (id: "saanp" | "mines") => arcadePrefs.set((p) => playedGame(p, id));
