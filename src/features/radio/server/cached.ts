import { cacheLife } from "next/cache";
import type { FacetKind, StationQuery } from "../types";
import { radioBrowser } from "./client";
import { listFacet, searchStations } from "./queries";

/**
 * Cached entry points used by the API routes. Arguments form the cache key, so the same
 * search from many visitors costs one Radio Browser request. Errors are never cached.
 * Note: the default cache is in memory per server instance; on serverless hosting it may
 * not be shared between instances. The routes also send Cache-Control headers so a CDN can help.
 */

export async function cachedSearchStations(query: StationQuery) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 }); // station health changes through the day
  return searchStations(radioBrowser, query);
}

export async function cachedFacet(kind: FacetKind) {
  "use cache";
  cacheLife("days"); // the country/language/genre lists barely move
  return listFacet(radioBrowser, kind);
}
