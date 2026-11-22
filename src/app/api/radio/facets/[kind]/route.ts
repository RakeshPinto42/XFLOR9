import { NextResponse, type NextRequest } from "next/server";
import { cachedFacet } from "@/features/radio/server/cached";
import { apiError, upstreamError } from "@/features/radio/server/http";
import type { FacetKind } from "@/features/radio/types";

const KINDS: readonly FacetKind[] = ["countries", "languages", "tags"];

/** GET /api/radio/facets/countries | languages | tags — filter options, most stations first. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/radio/facets/[kind]">) {
  const { kind } = await ctx.params;
  if (!KINDS.includes(kind as FacetKind))
    return apiError(404, "unknown-facet", "Filters are available for countries, languages and tags.");

  try {
    const facets = await cachedFacet(kind as FacetKind);
    return NextResponse.json(
      { facets },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (err) {
    return upstreamError(err);
  }
}
