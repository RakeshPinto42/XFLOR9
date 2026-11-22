import { isStationId, normalizeStation } from "../station";
import { toRadioBrowserParams } from "../query";
import type { Facet, FacetKind, Station, StationPage, StationQuery } from "../types";
import { RadioBrowserError, type RadioBrowserClient } from "./client";

/** One page of stations. Only stations available to every browser are returned. */
export async function searchStations(client: RadioBrowserClient, query: StationQuery): Promise<StationPage> {
  const raw = await client.getJson("/json/stations/search", toRadioBrowserParams(query));
  if (!Array.isArray(raw)) throw new RadioBrowserError("bad-response", "Station search did not return a list");

  // We asked for limit + 1 rows: an extra row means there is another page.
  const hasMore = raw.length > query.limit;
  const stations = raw
    .slice(0, query.limit)
    .map(normalizeStation)
    .filter((s): s is Station => s !== null && s.availability.status === "available");

  return { stations, offset: query.offset, limit: query.limit, hasMore };
}

export const MAX_LOOKUP_IDS = 50;

/**
 * Current directory data for saved stations (favourites). Unlike search, unavailable stations
 * are returned too, so the UI can say why a saved station no longer plays.
 * Verified live: unknown ids are simply left out of the response.
 */
export async function lookupStations(client: RadioBrowserClient, ids: string[]): Promise<Station[]> {
  const valid = [...new Set(ids)].filter(isStationId).slice(0, MAX_LOOKUP_IDS);
  if (valid.length === 0) return [];
  const raw = await client.getJson("/json/stations/byuuid", new URLSearchParams({ uuids: valid.join(",") }));
  if (!Array.isArray(raw)) throw new RadioBrowserError("bad-response", "Station lookup did not return a list");
  return raw.map(normalizeStation).filter((s): s is Station => s !== null && valid.includes(s.id));
}

const FACET_LIMITS: Record<FacetKind, number> = { countries: 250, languages: 150, tags: 150 };

/** Filter options (countries, languages, genres), most stations first. */
export async function listFacet(client: RadioBrowserClient, kind: FacetKind): Promise<Facet[]> {
  const params = new URLSearchParams({
    order: "stationcount",
    reverse: "true",
    hidebroken: "true",
    limit: String(FACET_LIMITS[kind]),
  });
  const raw = await client.getJson(`/json/${kind}`, params);
  if (!Array.isArray(raw)) throw new RadioBrowserError("bad-response", `${kind} did not return a list`);

  const facets: Facet[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const count = typeof r.stationcount === "number" ? r.stationcount : 0;
    if (!name || count < 1) continue;

    if (kind === "countries") {
      // Verified live: countries carry `iso_3166_1`, not `countrycode`.
      const code = typeof r.iso_3166_1 === "string" ? r.iso_3166_1.toUpperCase() : "";
      if (/^[A-Z]{2}$/.test(code)) facets.push({ value: code, label: name, stationCount: count });
    } else {
      if (name.length > 40) continue;
      facets.push({ value: name.toLowerCase(), label: capitalise(name), stationCount: count });
    }
  }
  return facets;
}

/**
 * Tells Radio Browser a listener started a station (the API asks clients to do this on every
 * play, to rank popular stations). Returns false if the station isn't known.
 */
export async function registerClick(client: RadioBrowserClient, stationId: string): Promise<boolean> {
  if (!isStationId(stationId)) throw new RadioBrowserError("bad-request", "Not a station id");
  let raw: unknown;
  try {
    raw = await client.getJson(`/json/url/${stationId}`);
  } catch (err) {
    // Verified live: an unknown station id answers HTTP 404 with an empty body.
    if (err instanceof RadioBrowserError && err.status === 404) return false;
    throw err;
  }
  return typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).ok === true;
}

function capitalise(s: string): string {
  return s.replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}
