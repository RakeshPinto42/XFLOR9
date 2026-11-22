import { classifyAvailability, isStationId } from "./station";
import type { Availability, Station, StreamFormat, UnavailableReason } from "./types";

/**
 * Favourites and recently played: pure list logic (tested) plus validation of saved data.
 * Stations are saved as full snapshots so the lists render instantly and offline;
 * favourites are refreshed from the directory when viewed (stream URLs can change).
 */

export const MAX_FAVOURITES = 200;
export const MAX_RECENTS = 20;

export interface RecentPlay {
  station: Station;
  playedAt: number; // epoch ms
}

/** Adds the station if missing (newest first), removes it if present. */
export function toggleFavourite(list: Station[], station: Station): Station[] {
  return list.some((s) => s.id === station.id)
    ? list.filter((s) => s.id !== station.id)
    : [station, ...list].slice(0, MAX_FAVOURITES);
}

/** Moves the station to the top (no duplicates) and keeps the newest MAX_RECENTS. */
export function addRecent(list: RecentPlay[], station: Station, now: number): RecentPlay[] {
  return [{ station, playedAt: now }, ...list.filter((r) => r.station.id !== station.id)].slice(0, MAX_RECENTS);
}

/** Replaces saved snapshots with fresh directory data, keeping the user's order. */
export function refreshSnapshots(list: Station[], fresh: Station[]): { stations: Station[]; missing: Set<string> } {
  const byId = new Map(fresh.map((s) => [s.id, s]));
  const missing = new Set<string>();
  const stations = list.map((s) => {
    const f = byId.get(s.id);
    if (!f) missing.add(s.id);
    return f ?? s;
  });
  return { stations, missing };
}

// ---------- validation of data read back from localStorage ----------

const FORMATS: readonly StreamFormat[] = ["mp3", "aac", "ogg", "hls", "unknown"];
const REASONS: readonly UnavailableReason[] = [
  "insecure-stream",
  "failing-check",
  "certificate-error",
  "playlist-file",
  "invalid-url",
];

/** Rebuilds a Station from untrusted saved data, or null. Stream URLs must still be https. */
export function parseSavedStation(v: unknown): Station | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const str = (x: unknown, max = 200) => (typeof x === "string" ? x.slice(0, max) : "");
  const strList = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").slice(0, 8) : []);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

  const id = str(r.id);
  const name = str(r.name, 120).trim();
  const streamUrl = str(r.streamUrl, 2000);
  if (!isStationId(id) || !name) return null;

  const saved = r.availability as { status?: unknown; reason?: unknown } | undefined;
  // Re-check the URL ourselves; a saved "available" flag is not trusted on its own.
  const urlCheck = classifyAvailability(streamUrl, 1, 0);
  const availability: Availability =
    urlCheck.status === "unavailable"
      ? urlCheck
      : saved?.status === "unavailable" && REASONS.includes(saved.reason as UnavailableReason)
        ? { status: "unavailable", reason: saved.reason as UnavailableReason }
        : { status: "available" };

  const format = FORMATS.includes(r.format as StreamFormat) ? (r.format as StreamFormat) : "unknown";
  return {
    id,
    name,
    streamUrl,
    homepage: null,
    favicon: null,
    country: str(r.country, 80),
    countryCode: str(r.countryCode, 2),
    languages: strList(r.languages),
    tags: strList(r.tags),
    format,
    codecLabel: str(r.codecLabel, 20) || "UNKNOWN",
    bitrate: num(r.bitrate) || null,
    votes: num(r.votes),
    clicks: num(r.clicks),
    lastCheckedAt: str(r.lastCheckedAt, 40) || null,
    availability,
  };
}

export function parseFavourites(raw: unknown): Station[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Station[] = [];
  for (const item of raw) {
    const s = parseSavedStation(item);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out.slice(0, MAX_FAVOURITES);
}

export function parseRecents(raw: unknown): RecentPlay[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RecentPlay[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const station = parseSavedStation(r.station);
    const playedAt = typeof r.playedAt === "number" && Number.isFinite(r.playedAt) ? r.playedAt : 0;
    if (station && !seen.has(station.id)) {
      seen.add(station.id);
      out.push({ station, playedAt });
    }
  }
  return out.sort((a, b) => b.playedAt - a.playedAt).slice(0, MAX_RECENTS);
}
