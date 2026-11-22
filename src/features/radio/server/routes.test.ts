import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RadioBrowserError } from "./client";

vi.mock("./cached", () => ({ cachedSearchStations: vi.fn(), cachedFacet: vi.fn(), cachedLookupStations: vi.fn() }));
vi.mock("./queries", async (orig) => ({ ...(await orig<typeof import("./queries")>()), registerClick: vi.fn() }));

const { cachedSearchStations, cachedFacet, cachedLookupStations } = await import("./cached");
const lookupRoute = await import("@/app/api/radio/stations/lookup/route");
const { registerClick } = await import("./queries");
const stationsRoute = await import("@/app/api/radio/stations/route");
const facetsRoute = await import("@/app/api/radio/facets/[kind]/route");
const clickRoute = await import("@/app/api/radio/stations/[id]/click/route");

const req = (path: string, method = "GET") => new NextRequest(`http://localhost${path}`, { method });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const ID = "e928bf7b-7de2-4447-87ec-369d1be1b9f5";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/radio/stations", () => {
  it("returns a page with cache headers", async () => {
    const page = { stations: [], offset: 0, limit: 24, hasMore: false };
    vi.mocked(cachedSearchStations).mockResolvedValue(page);
    const res = await stationsRoute.GET(req("/api/radio/stations?country=in&q=mirchi"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=600");
    expect(cachedSearchStations).toHaveBeenCalledWith(
      expect.objectContaining({ countryCode: "IN", name: "mirchi", order: "popular" }),
    );
  });

  it("rejects an invalid query with 400 and never calls upstream", async () => {
    const res = await stationsRoute.GET(req("/api/radio/stations?limit=500"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "invalid-query" } });
    expect(cachedSearchStations).not.toHaveBeenCalled();
  });

  it("answers 502 with a readable message, uncached, when the directory is down", async () => {
    vi.mocked(cachedSearchStations).mockRejectedValue(new RadioBrowserError("unreachable", "all failed"));
    const res = await stationsRoute.GET(req("/api/radio/stations"));
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.error.code).toBe("directory-unavailable");
    expect(body.error.message).not.toContain("all failed"); // internals stay in the server log
  });
});

describe("GET /api/radio/facets/[kind]", () => {
  it("returns facets for a known kind", async () => {
    vi.mocked(cachedFacet).mockResolvedValue([{ value: "IN", label: "India", stationCount: 1 }]);
    const res = await facetsRoute.GET(req("/api/radio/facets/countries"), ctx({ kind: "countries" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ facets: [{ value: "IN", label: "India", stationCount: 1 }] });
  });

  it("404s an unknown kind", async () => {
    const res = await facetsRoute.GET(req("/api/radio/facets/stats"), ctx({ kind: "stats" }));
    expect(res.status).toBe(404);
    expect(cachedFacet).not.toHaveBeenCalled();
  });
});

describe("GET /api/radio/stations/lookup", () => {
  const OTHER = "00000000-0000-4000-8000-000000000001";

  it("looks up de-duplicated, sorted ids with a private cache header", async () => {
    vi.mocked(cachedLookupStations).mockResolvedValue([]);
    const res = await lookupRoute.GET(req(`/api/radio/stations/lookup?ids=${ID},${OTHER},${ID}`));
    expect(res.status).toBe(200);
    expect(cachedLookupStations).toHaveBeenCalledWith([OTHER, ID]);
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it.each([["ids="], ["ids=abc"], [`ids=${Array(51).fill(ID).join(",")}`]])("rejects %s", async (qs) => {
    const res = await lookupRoute.GET(req(`/api/radio/stations/lookup?${qs}`));
    expect(res.status).toBe(400);
    expect(cachedLookupStations).not.toHaveBeenCalled();
  });
});

describe("POST /api/radio/stations/[id]/click", () => {
  it("answers 204 when counted", async () => {
    vi.mocked(registerClick).mockResolvedValue(true);
    const res = await clickRoute.POST(req(`/api/radio/stations/${ID}/click`, "POST"), ctx({ id: ID }));
    expect(res.status).toBe(204);
  });

  it("answers 404 for an unknown station", async () => {
    vi.mocked(registerClick).mockResolvedValue(false);
    const res = await clickRoute.POST(req(`/api/radio/stations/${ID}/click`, "POST"), ctx({ id: ID }));
    expect(res.status).toBe(404);
  });

  it("answers 400 for a malformed id without calling upstream", async () => {
    const res = await clickRoute.POST(req("/api/radio/stations/abc/click", "POST"), ctx({ id: "abc" }));
    expect(res.status).toBe(400);
    expect(registerClick).not.toHaveBeenCalled();
  });
});
