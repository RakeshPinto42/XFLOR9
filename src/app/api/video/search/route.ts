import { NextResponse, type NextRequest } from "next/server";
import { SEARCH_ERROR_MESSAGES, parseSearchQuery, type SearchErrorCode } from "@/features/video/search";
import { YouTubeSearchError } from "@/features/video/server/youtubeSearch";
import { cachedSearch, searchRateLimit, youtubeSearch } from "@/features/video/server/searchService";

/**
 * GET /api/video/search?q=…&pageToken=…
 * YouTube search through XPLOR9's server, so the API key never reaches the browser.
 * Errors: { error: { code, message } } with 400 / 429 / 502 / 503.
 */
const STATUS: Record<SearchErrorCode, number> = { "invalid-query": 400, "not-configured": 503, "daily-limit": 429, "rate-limited": 429, unavailable: 502 };

function error(code: SearchErrorCode) {
  return NextResponse.json({ error: { code, message: SEARCH_ERROR_MESSAGES[code] } }, { status: STATUS[code], headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (!youtubeSearch.configured()) return error("not-configured");
  const sp = request.nextUrl.searchParams;
  const parsed = parseSearchQuery(sp.get("q"), sp.get("pageToken"));
  if (!parsed.ok) return error("invalid-query");
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  if (!searchRateLimit.allow(visitor)) return error("rate-limited");

  try {
    const page = await cachedSearch(parsed.q.toLowerCase(), parsed.pageToken);
    return NextResponse.json(page, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    if (err instanceof YouTubeSearchError) {
      if (err.code === "unavailable") console.error("[video search]", err.message); // reasons only, never the key
      return error(err.code);
    }
    console.error("[video search] unexpected failure");
    return error("unavailable");
  }
}
