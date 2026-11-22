import type { SortOrder, StationQuery } from "./types";

export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 50;
export const MAX_OFFSET = 5000;

const ORDERS: Record<SortOrder, { order: string; reverse: boolean }> = {
  popular: { order: "clickcount", reverse: true },
  trending: { order: "clicktrend", reverse: true },
  votes: { order: "votes", reverse: true },
  name: { order: "name", reverse: false },
};

// Letters in any script, combining marks (Devanagari, Tamil etc. vowel signs are marks, not
// letters), digits, spaces and a little punctuation. Blocks control characters and markup.
const FILTER_TEXT = /^[\p{L}\p{M}\p{N} .&'+\-/]+$/u;

export type ParseResult = { ok: true; query: StationQuery } | { ok: false; message: string };

/** Validates our own API's query string. Only known, checked values ever reach Radio Browser. */
export function parseStationQuery(params: URLSearchParams): ParseResult {
  const name = params.get("q")?.trim() || undefined;
  if (name && (name.length > 80 || /[\u0000-\u001f]/.test(name)))
    return { ok: false, message: "Search text must be 80 characters or fewer." };

  const countryRaw = params.get("country")?.trim();
  if (countryRaw && !/^[A-Za-z]{2}$/.test(countryRaw))
    return { ok: false, message: "Country must be a two-letter code, like IN." };

  const language = params.get("language")?.trim().toLowerCase() || undefined;
  if (language && (language.length > 40 || !FILTER_TEXT.test(language)))
    return { ok: false, message: "That language filter isn't valid." };

  const tag = params.get("tag")?.trim().toLowerCase() || undefined;
  if (tag && (tag.length > 40 || !FILTER_TEXT.test(tag)))
    return { ok: false, message: "That genre filter isn't valid." };

  const orderRaw = params.get("order") ?? "popular";
  if (!(orderRaw in ORDERS)) return { ok: false, message: "Sort must be popular, trending, votes or name." };

  const offset = intParam(params.get("offset"), 0);
  const limit = intParam(params.get("limit"), DEFAULT_LIMIT);
  if (offset === null || offset < 0 || offset > MAX_OFFSET)
    return { ok: false, message: `Offset must be a whole number from 0 to ${MAX_OFFSET}.` };
  if (limit === null || limit < 1 || limit > MAX_LIMIT)
    return { ok: false, message: `Limit must be a whole number from 1 to ${MAX_LIMIT}.` };

  return {
    ok: true,
    query: {
      name,
      countryCode: countryRaw?.toUpperCase(),
      language,
      tag,
      order: orderRaw as SortOrder,
      offset,
      limit,
    },
  };
}

/**
 * Builds the Radio Browser search parameters. Parameter names were verified live:
 * Radio Browser silently ignores unknown parameters, so a typo here would quietly
 * return unfiltered results. Tests pin these names.
 */
export function toRadioBrowserParams(query: StationQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.name) p.set("name", query.name);
  if (query.countryCode) p.set("countrycode", query.countryCode);
  if (query.language) {
    p.set("language", query.language);
    p.set("languageExact", "true");
  }
  if (query.tag) {
    p.set("tag", query.tag);
    p.set("tagExact", "true");
  }
  const { order, reverse } = ORDERS[query.order];
  p.set("order", order);
  p.set("reverse", String(reverse));
  p.set("hidebroken", "true"); // drop stations whose last automated check failed
  p.set("is_https", "true"); // filter http-only at the source so pages stay full
  p.set("offset", String(query.offset));
  p.set("limit", String(query.limit + 1)); // one extra row tells us whether another page exists
  return p;
}

function intParam(value: string | null, fallback: number): number | null {
  if (value === null || value === "") return fallback;
  return /^\d+$/.test(value) ? Number(value) : null;
}
