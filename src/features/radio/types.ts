/**
 * Radio data contracts. `Station` is XPLOR9's own clean model; the raw Radio Browser
 * shape never leaves the server. Field names below were verified against live
 * API responses (api.radio-browser.info, software 0.7.51, Nov 2026).
 */

/** How the stream is delivered. Decides whether a browser can play it. */
export type StreamFormat = "mp3" | "aac" | "ogg" | "hls" | "unknown";

/** Server-side verdict, the same for every browser. */
export type UnavailableReason =
  | "insecure-stream" // http:// — browsers block it on an https site, and we don't proxy
  | "failing-check" // Radio Browser's last automated check failed
  | "certificate-error" // https, but the certificate is broken
  | "playlist-file" // .m3u/.pls playlist, not an audio stream
  | "invalid-url";

export type Availability = { status: "available" } | { status: "unavailable"; reason: UnavailableReason };

export interface Station {
  id: string; // Radio Browser stationuuid
  name: string;
  streamUrl: string;
  homepage: string | null;
  favicon: string | null; // https only, else null (avoids mixed-content warnings)
  country: string;
  countryCode: string;
  languages: string[];
  tags: string[];
  format: StreamFormat;
  codecLabel: string; // as reported, e.g. "AAC+"
  bitrate: number | null; // kbps, null when unknown (API reports 0)
  votes: number;
  clicks: number;
  lastCheckedAt: string | null; // ISO 8601
  availability: Availability;
}

export interface StationPage {
  stations: Station[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

export type SortOrder = "popular" | "trending" | "votes" | "name";

export interface StationQuery {
  name?: string;
  countryCode?: string;
  language?: string;
  tag?: string;
  order: SortOrder;
  offset: number;
  limit: number;
}

export type FacetKind = "countries" | "languages" | "tags";

export interface Facet {
  value: string; // what to send back as a filter
  label: string; // what to show
  stationCount: number; // all stations in the directory, not only https/playable ones
}
