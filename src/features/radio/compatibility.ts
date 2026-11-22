import type { Station, StreamFormat } from "./types";

/**
 * Per-browser verdict, computed in the visitor's browser (Chrome, Safari and Firefox differ).
 *  - playable:    passes every check we can do before pressing play
 *  - unverified:  format unknown; we can only find out by trying
 *  - unsupported: this browser can't decode the format (e.g. HLS without native support)
 *  - unavailable: blocked for everyone (see Station.availability.reason)
 * Even "playable" is a pre-check, not a guarantee: a stream can still go offline.
 * Real playback errors are handled by the player (Milestone 3).
 */
export type Playability = "playable" | "unverified" | "unsupported" | "unavailable";

const MIME_TYPES: Record<Exclude<StreamFormat, "unknown">, string[]> = {
  mp3: ["audio/mpeg"],
  aac: ["audio/aac", 'audio/mp4; codecs="mp4a.40.5"', 'audio/mp4; codecs="mp4a.40.2"'],
  ogg: ['audio/ogg; codecs="vorbis"', 'audio/ogg; codecs="opus"', "audio/ogg"],
  hls: ["application/vnd.apple.mpegurl", "application/x-mpegurl"],
};

/** `canPlayType` is injected so this stays testable; in the browser pass `(t) => audio.canPlayType(t)`. */
export function getPlayability(
  station: Pick<Station, "availability" | "format">,
  canPlayType: (mimeType: string) => string,
): Playability {
  if (station.availability.status !== "available") return "unavailable";
  if (station.format === "unknown") return "unverified";
  // canPlayType answers "probably", "maybe" or "" (no).
  return MIME_TYPES[station.format].some((type) => canPlayType(type) !== "") ? "playable" : "unsupported";
}
