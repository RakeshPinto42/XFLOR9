import { NextResponse, type NextRequest } from "next/server";
import { parseStationQuery } from "@/features/radio/query";
import { cachedSearchStations } from "@/features/radio/server/cached";
import { apiError, upstreamError } from "@/features/radio/server/http";

/**
 * GET /api/radio/stations?q=&country=IN&language=hindi&tag=bollywood&order=popular&offset=0&limit=24
 * Returns a StationPage of https, recently-checked stations only.
 */
export async function GET(request: NextRequest) {
  const parsed = parseStationQuery(request.nextUrl.searchParams);
  if (!parsed.ok) return apiError(400, "invalid-query", parsed.message);

  try {
    const page = await cachedSearchStations(parsed.query);
    return NextResponse.json(page, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (err) {
    return upstreamError(err);
  }
}
