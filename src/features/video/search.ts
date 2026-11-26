/**
 * YouTube search: the contract between the browser and XPLOR9's server route (/api/video/search).
 * Plain TypeScript, used on both sides and unit-tested. The API key never leaves the server.
 */

export interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  /** ISO date, or null when YouTube didn't say. */
  publishedAt: string | null;
  /** A YouTube thumbnail (https://i.ytimg.com only), or null. */
  thumbnail: string | null;
}

export interface SearchPage {
  results: SearchResult[];
  nextPageToken: string | null;
}

export type SearchErrorCode = "invalid-query" | "not-configured" | "daily-limit" | "rate-limited" | "unavailable";

export const SEARCH_ERROR_MESSAGES: Record<SearchErrorCode, string> = {
  "invalid-query": "Type at least two letters to search.",
  "not-configured": "Searching YouTube isn't set up on this XPLOR9 yet. Featured videos, channels and pasted links still work.",
  "daily-limit": "Today's searches are used up (YouTube allows XPLOR9 a fixed number a day). Earlier searches still work, and more open up tomorrow.",
  "rate-limited": "That's a lot of searches in a short time. Wait a minute, then try again.",
  unavailable: "YouTube search isn't responding. Try again in a minute.",
};

export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

export type ParsedQuery = { ok: true; q: string; pageToken: string | null } | { ok: false };

/** Normalises a search (trimmed, single spaces, no control characters) and checks the page token. */
export function parseSearchQuery(q: unknown, pageToken: unknown): ParsedQuery {
  if (typeof q !== "string") return { ok: false };
  const clean = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < MIN_QUERY || clean.length > MAX_QUERY) return { ok: false };
  if (pageToken !== null && pageToken !== undefined && pageToken !== "" && (typeof pageToken !== "string" || !PAGE_TOKEN.test(pageToken))) return { ok: false };
  return { ok: true, q: clean, pageToken: typeof pageToken === "string" && pageToken ? pageToken : null };
}

/**
 * The address bar takes either a search or a YouTube link. Anything that looks like an address
 * (a scheme, or a domain with a path) is treated as a link; everything else is a search.
 */
export function looksLikeLink(text: string): boolean {
  const t = text.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(t) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*/i.test(t) || /^(www\.|m\.)?(youtube\.com|youtu\.be)\b/i.test(t);
}
