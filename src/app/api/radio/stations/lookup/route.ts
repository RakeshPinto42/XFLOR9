import { NextResponse, type NextRequest } from "next/server";
import { cachedLookupStations } from "@/features/radio/server/cached";
import { apiError, upstreamError } from "@/features/radio/server/http";
import { MAX_LOOKUP_IDS } from "@/features/radio/server/queries";
import { isStationId } from "@/features/radio/station";

/**
 * GET /api/radio/stations/lookup?ids=uuid,uuid — fresh data for saved stations.
 * Includes unavailable stations (with the reason); unknown ids are left out.
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return apiError(400, "invalid-query", "Give at least one station id.");
  if (ids.length > MAX_LOOKUP_IDS) return apiError(400, "invalid-query", `Look up at most ${MAX_LOOKUP_IDS} stations at once.`);
  if (!ids.every(isStationId)) return apiError(400, "invalid-query", "Station ids must be valid ids.");

  try {
    const stations = await cachedLookupStations([...new Set(ids)].sort());
    return NextResponse.json(
      { stations },
      { headers: { "Cache-Control": "private, max-age=300" } }, // a personal list: don't share in CDNs
    );
  } catch (err) {
    return upstreamError(err);
  }
}
