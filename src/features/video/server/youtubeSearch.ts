import type { SearchErrorCode, SearchPage, SearchResult } from "../search";

/**
 * Server side of YouTube search (YouTube Data API v3, search.list). Holds the quota rules:
 *   - each search costs 100 of the project's 10,000 free daily units, so XPLOR9 allows itself a
 *     daily budget of searches (default 90), counted per Pacific day, which is when Google resets
 *     the quota; Google's own "quota exceeded" answer also closes the day;
 *   - only real calls to Google count (the caller caches results, so repeats are free).
 * Results are validated field by field before they leave the server. The key is only ever put
 * into the request to Google, never into logs, errors or responses.
 */

export class YouTubeSearchError extends Error {
  readonly code: SearchErrorCode;
  constructor(code: SearchErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "YouTubeSearchError";
    this.code = code;
  }
}

export interface SearchDeps {
  apiKey: string | undefined;
  fetch: typeof fetch;
  now: () => number;
  /** Searches allowed per Pacific day (each costs 100 quota units). */
  dailyLimit: number;
}

export const API_URL = "https://www.googleapis.com/youtube/v3/search";
export const RESULTS_PER_PAGE = 12;
const REQUEST_TIMEOUT_MS = 8_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The quota day in YouTube's time zone (Pacific), e.g. "2026-11-26". */
export function quotaDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function createYouTubeSearch(deps: SearchDeps) {
  let day = "";
  let used = 0;
  let closed = false; // Google said the quota is exhausted

  const rollDay = () => {
    const today = quotaDay(deps.now());
    if (today !== day) {
      day = today;
      used = 0;
      closed = false;
    }
  };

  return {
    configured: () => !!deps.apiKey,
    /** Searches left today (for the status line and tests). */
    remaining() {
      rollDay();
      return closed ? 0 : Math.max(0, deps.dailyLimit - used);
    },

    async search(q: string, pageToken: string | null): Promise<SearchPage> {
      if (!deps.apiKey) throw new YouTubeSearchError("not-configured");
      rollDay();
      if (closed || used >= deps.dailyLimit) throw new YouTubeSearchError("daily-limit");
      used++;

      const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        videoEmbeddable: "true", // only videos that may play in XPLOR9's embedded player
        safeSearch: "moderate",
        maxResults: String(RESULTS_PER_PAGE),
        q,
        key: deps.apiKey,
      });
      if (pageToken) params.set("pageToken", pageToken);

      let res: Response;
      try {
        res = await deps.fetch(`${API_URL}?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch {
        throw new YouTubeSearchError("unavailable", "request failed");
      }
      if (!res.ok) {
        const reason = await errorReason(res);
        if (res.status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded")) {
          closed = true;
          throw new YouTubeSearchError("daily-limit", reason);
        }
        if (res.status === 400) throw new YouTubeSearchError("invalid-query", reason ?? "bad request");
        throw new YouTubeSearchError("unavailable", `status ${res.status}${reason ? ` ${reason}` : ""}`);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new YouTubeSearchError("unavailable", "invalid JSON");
      }
      return toSearchPage(body);
    },
  };
}

/** Google's error reason (e.g. "quotaExceeded"), read defensively. */
async function errorReason(res: Response): Promise<string | null> {
  try {
    const b = (await res.json()) as { error?: { errors?: { reason?: unknown }[] } };
    const r = b?.error?.errors?.[0]?.reason;
    return typeof r === "string" && /^[A-Za-z]{1,40}$/.test(r) ? r : null;
  } catch {
    return null;
  }
}

/** Untrusted API output → XPLOR9's own shape. Entries that don't validate are dropped. */
export function toSearchPage(body: unknown): SearchPage {
  const b = (typeof body === "object" && body !== null ? body : {}) as { items?: unknown; nextPageToken?: unknown };
  const items = Array.isArray(b.items) ? b.items : [];
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const it = (typeof raw === "object" && raw !== null ? raw : {}) as { id?: { videoId?: unknown }; snippet?: Record<string, unknown> };
    const id = it.id?.videoId;
    const s = it.snippet ?? {};
    if (typeof id !== "string" || !VIDEO_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    results.push({
      videoId: id,
      title: text(s.title, "Untitled video"),
      channelTitle: text(s.channelTitle, "YouTube"),
      publishedAt: typeof s.publishedAt === "string" && !Number.isNaN(Date.parse(s.publishedAt)) ? new Date(s.publishedAt).toISOString() : null,
      thumbnail: thumbnail(s.thumbnails),
    });
  }
  const next = typeof b.nextPageToken === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.nextPageToken) ? b.nextPageToken : null;
  return { results, nextPageToken: next };
}

function text(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const t = decodeEntities(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
  return t || fallback;
}

/** search.list returns titles HTML-escaped ("Rock &amp; Roll"); they are shown as text, never as HTML. */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6}|#39);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (named[k]) return named[k];
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : k.startsWith("#") ? parseInt(k.slice(1), 10) : NaN;
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

function thumbnail(t: unknown): string | null {
  const all = (typeof t === "object" && t !== null ? t : {}) as Record<string, { url?: unknown }>;
  for (const size of ["medium", "high", "default"]) {
    const url = all[size]?.url;
    if (typeof url !== "string") continue;
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && u.hostname === "i.ytimg.com") return u.href;
    } catch {
      // not a URL: skip
    }
  }
  return null;
}
