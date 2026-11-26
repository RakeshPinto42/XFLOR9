import { parseSavedStation } from "./library";
import type { Station } from "./types";

/**
 * The tuner's six memory buttons, like a car radio or hi-fi tuner: each holds one station
 * (a saved copy, so it plays without searching again). Plain functions, unit-tested.
 */

export const PRESET_COUNT = 6;
export type Presets = (Station | null)[];

export const EMPTY_PRESETS: Presets = Array.from({ length: PRESET_COUNT }, () => null);

/** Saved presets may be old or edited by hand: exactly six slots, each a valid station or empty. */
export function parsePresets(raw: unknown): Presets {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: PRESET_COUNT }, (_, i) => (list[i] == null ? null : parseSavedStation(list[i])));
}

/** Store a station in a slot. A station lives in one slot at a time (storing it again moves it). */
export function storePreset(p: Presets, slot: number, station: Station): Presets {
  if (slot < 0 || slot >= PRESET_COUNT) return p;
  return p.map((s, i) => (i === slot ? station : s?.id === station.id ? null : s));
}

export function clearPreset(p: Presets, slot: number): Presets {
  return p.map((s, i) => (i === slot ? null : s));
}

/** Which slot holds this station (-1 if none). */
export function presetSlot(p: Presets, stationId: string | undefined): number {
  return stationId ? p.findIndex((s) => s?.id === stationId) : -1;
}

export type SortKey = "rank" | "name" | "country" | "bitrate";

/** The station table's column sort ("rank" keeps the directory's own order). Never mutates. */
export function sortStations(list: readonly Station[], key: SortKey, descending: boolean): Station[] {
  if (key === "rank") return descending ? [...list].reverse() : [...list];
  const value = (s: Station): string | number => (key === "name" ? s.name.toLowerCase() : key === "country" ? s.country.toLowerCase() : (s.bitrate ?? -1));
  const out = [...list].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return descending ? out.reverse() : out;
}
