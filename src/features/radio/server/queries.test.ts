import { describe, expect, it, vi } from "vitest";
import { rawStation } from "../__fixtures__/stations";
import { RadioBrowserError, type RadioBrowserClient } from "./client";
import { listFacet, lookupStations, registerClick, searchStations } from "./queries";

const clientReturning = (body: unknown): RadioBrowserClient => ({
  getJson: vi.fn(async () => body),
  getServers: async () => [],
});

describe("searchStations", () => {
  const query = { order: "popular" as const, offset: 0, limit: 2 };

  it("reports another page when Radio Browser returns the extra row", async () => {
    const page = await searchStations(clientReturning([rawStation(), rawStation(), rawStation()]), query);
    expect(page.stations).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it("reports the last page when there is no extra row", async () => {
    const page = await searchStations(clientReturning([rawStation()]), query);
    expect(page).toMatchObject({ offset: 0, limit: 2, hasMore: false });
  });

  it("drops malformed and unavailable stations even if the upstream filter missed them", async () => {
    const page = await searchStations(
      clientReturning([rawStation({ url_resolved: "http://x.example/s" }), { junk: true }]),
      { ...query, limit: 5 },
    );
    expect(page.stations).toEqual([]);
  });

  it("rejects a non-list response", async () => {
    await expect(searchStations(clientReturning({ error: "x" }), query)).rejects.toMatchObject({
      code: "bad-response",
    });
  });
});

describe("listFacet", () => {
  it("maps countries by ISO code (verified field: iso_3166_1)", async () => {
    const facets = await listFacet(
      clientReturning([
        { name: "India", iso_3166_1: "IN", stationcount: 900 },
        { name: "Nowhere", iso_3166_1: "", stationcount: 4 },
      ]),
      "countries",
    );
    expect(facets).toEqual([{ value: "IN", label: "India", stationCount: 900 }]);
  });

  it("labels languages and tags for display but filters by the raw name", async () => {
    const facets = await listFacet(
      clientReturning([
        { name: "hindi", iso_639: "hi", stationcount: 500 },
        { name: "empty", stationcount: 0 },
      ]),
      "languages",
    );
    expect(facets).toEqual([{ value: "hindi", label: "Hindi", stationCount: 500 }]);
  });
});

describe("lookupStations", () => {
  it("returns saved stations including unavailable ones, and sends only valid ids", async () => {
    const ok = rawStation();
    const broken = rawStation({ lastcheckok: 0 });
    const client = clientReturning([ok, broken]);
    const out = await lookupStations(client, [ok.stationuuid, broken.stationuuid, "not-an-id"]);
    expect(out.map((s) => s.availability.status)).toEqual(["available", "unavailable"]);
    const params = vi.mocked(client.getJson).mock.calls[0][1] as URLSearchParams;
    expect(params.get("uuids")).toBe(`${ok.stationuuid},${broken.stationuuid}`);
  });

  it("skips the request when no ids are valid", async () => {
    const client = clientReturning([]);
    expect(await lookupStations(client, ["x"])).toEqual([]);
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it("ignores stations the API returns that weren't asked for", async () => {
    const asked = rawStation();
    const out = await lookupStations(clientReturning([asked, rawStation()]), [asked.stationuuid]);
    expect(out.map((s) => s.id)).toEqual([asked.stationuuid]);
  });
});

describe("registerClick", () => {
  const id = "e928bf7b-7de2-4447-87ec-369d1be1b9f5";

  it("is true when Radio Browser confirms", async () => {
    expect(await registerClick(clientReturning({ ok: true, stationuuid: id }), id)).toBe(true);
  });

  it("is false for an unknown station (live API answers 404)", async () => {
    const client: RadioBrowserClient = {
      getJson: async () => {
        throw new RadioBrowserError("bad-request", "404", 404);
      },
      getServers: async () => [],
    };
    expect(await registerClick(client, id)).toBe(false);
  });

  it("never sends an invalid id upstream", async () => {
    const client = clientReturning({ ok: true });
    await expect(registerClick(client, "../json/stats")).rejects.toBeInstanceOf(RadioBrowserError);
    expect(client.getJson).not.toHaveBeenCalled();
  });
});
