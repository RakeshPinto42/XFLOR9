import { NextResponse, type NextRequest } from "next/server";
import { radioBrowser } from "@/features/radio/server/client";
import { apiError, upstreamError } from "@/features/radio/server/http";
import { registerClick } from "@/features/radio/server/queries";
import { isStationId } from "@/features/radio/station";

/**
 * POST /api/radio/stations/{id}/click — the player calls this when a station starts,
 * as Radio Browser asks every client to. Never cached. Not used by the UI until Milestone 3.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/radio/stations/[id]/click">) {
  const { id } = await ctx.params;
  if (!isStationId(id)) return apiError(400, "invalid-station", "That isn't a valid station id.");

  try {
    const known = await registerClick(radioBrowser, id);
    if (!known) return apiError(404, "unknown-station", "That station isn't in the directory.");
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return upstreamError(err);
  }
}
