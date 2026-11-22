import type { Availability, Station, StreamFormat } from "./types";

/**
 * Turns one raw Radio Browser record into a validated `Station`, or null if the record
 * is too malformed to use. External data is untrusted: every field is type-checked.
 */
export function normalizeStation(raw: unknown): Station | null {
  if (!isRecord(raw)) return null;

  const id = str(raw.stationuuid);
  const name = str(raw.name).trim();
  if (!UUID.test(id) || !name) return null;

  // url_resolved is the final stream URL after redirects/playlists; url is the fallback.
  const streamUrl = str(raw.url_resolved).trim() || str(raw.url).trim();
  const codecLabel = str(raw.codec).trim().toUpperCase() || "UNKNOWN";
  const bitrate = num(raw.bitrate);

  return {
    id,
    name: name.slice(0, 120),
    streamUrl,
    homepage: safeUrl(str(raw.homepage), ["http:", "https:"]),
    favicon: safeUrl(str(raw.favicon), ["https:"]),
    country: str(raw.country).trim(),
    countryCode: str(raw.countrycode).trim().toUpperCase(),
    languages: splitList(str(raw.language)),
    tags: splitList(str(raw.tags)),
    format: detectFormat(streamUrl, codecLabel, raw.hls),
    codecLabel,
    bitrate: bitrate > 0 ? bitrate : null,
    votes: num(raw.votes),
    clicks: num(raw.clickcount),
    lastCheckedAt: str(raw.lastchecktime_iso8601) || null,
    availability: classifyAvailability(streamUrl, raw.lastcheckok, raw.ssl_error),
  };
}

/** Same answer for every visitor: can this stream be played from an https page without a proxy? */
export function classifyAvailability(streamUrl: string, lastCheckOk: unknown, sslError: unknown): Availability {
  let url: URL;
  try {
    url = new URL(streamUrl);
  } catch {
    return { status: "unavailable", reason: "invalid-url" };
  }
  if (url.protocol === "http:") return { status: "unavailable", reason: "insecure-stream" };
  if (url.protocol !== "https:") return { status: "unavailable", reason: "invalid-url" };
  if (/\.(m3u|pls)$/i.test(url.pathname)) return { status: "unavailable", reason: "playlist-file" };
  if (num(sslError) !== 0) return { status: "unavailable", reason: "certificate-error" };
  if (num(lastCheckOk) !== 1) return { status: "unavailable", reason: "failing-check" };
  return { status: "available" };
}

/** The hls flag and the .m3u8 extension both mean HLS; otherwise trust the codec label. */
export function detectFormat(streamUrl: string, codecLabel: string, hlsFlag: unknown): StreamFormat {
  if (num(hlsFlag) === 1 || /\.m3u8(\?|$)/i.test(streamUrl)) return "hls";
  const codec = codecLabel.toUpperCase();
  if (codec === "MP3") return "mp3";
  if (codec === "AAC" || codec === "AAC+" || codec === "AACP" || codec === "HE-AAC") return "aac";
  if (codec === "OGG" || codec === "VORBIS" || codec === "OPUS") return "ogg";
  return "unknown";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStationId(value: string): boolean {
  return UUID.test(value);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function splitList(v: string): string[] {
  const seen = new Set<string>();
  for (const part of v.split(",")) {
    const item = part.trim().toLowerCase();
    if (item && item.length <= 40) seen.add(item);
  }
  return [...seen].slice(0, 8);
}
function safeUrl(v: string, protocols: string[]): string | null {
  try {
    const url = new URL(v.trim());
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
