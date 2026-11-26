import { cacheLife } from "next/cache";
import type { SearchPage } from "../search";
import { createRateLimiter } from "./rateLimit";
import { createYouTubeSearch } from "./youtubeSearch";

/**
 * The search service the route uses. Configuration comes from the server environment only:
 *   YOUTUBE_API_KEY              required for search (a YouTube Data API v3 key)
 *   YOUTUBE_SEARCH_DAILY_LIMIT   optional, searches per day (default 90, at most 95: 100 units each
 *                                against the free 10,000-unit quota, leaving headroom)
 * Note: on serverless hosting each instance keeps its own cache and counters; Google's own quota
 * answer is the final stop either way.
 */
const limit = Number.parseInt(process.env.YOUTUBE_SEARCH_DAILY_LIMIT ?? "", 10);

export const youtubeSearch = createYouTubeSearch({
  apiKey: process.env.YOUTUBE_API_KEY || undefined,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 95) : 90,
});

/** 20 searches a minute per visitor: plenty for a person, too few to drain the day. */
export const searchRateLimit = createRateLimiter({ limit: 20, windowMs: 60_000, now: () => Date.now() });

/**
 * Cached by query and page: the same search from anyone costs one call to Google. Results are kept
 * for hours (search results change slowly) and errors are never cached.
 */
export async function cachedSearch(q: string, pageToken: string | null): Promise<SearchPage> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 24 * 3600 });
  return youtubeSearch.search(q, pageToken);
}
