/**
 * Favourites and recently played for TV and Music: lists of catalogue ids kept in this browser.
 * Stored data may be old, corrupted or edited by hand, so it is re-validated on every read; ids
 * no longer in the catalogue are simply skipped when shown.
 */
import { SLUG } from "./catalogue";

export const MAX_RECENTS = 20;
export const MAX_FAVOURITES = 200;

export function parseIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) if (typeof v === "string" && v.length <= 100 && SLUG.test(v) && !out.includes(v)) out.push(v);
  return out.slice(0, max);
}

export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, MAX_FAVOURITES);
}

/** Most recent first, each id once. */
export function addRecentId(list: readonly string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENTS);
}
