import { describe, expect, it } from "vitest";
import { rawStation } from "./__fixtures__/stations";
import {
  MAX_RECENTS,
  addRecent,
  parseFavourites,
  parseRecents,
  parseSavedStation,
  refreshSnapshots,
  toggleFavourite,
} from "./library";
import { normalizeStation } from "./station";
import type { Station } from "./types";

const st = (overrides: Record<string, unknown> = {}) => normalizeStation(rawStation(overrides)) as Station;

describe("toggleFavourite", () => {
  it("adds newest first and removes on second toggle", () => {
    const a = st();
    const b = st();
    let list = toggleFavourite([], a);
    list = toggleFavourite(list, b);
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(toggleFavourite(list, a).map((s) => s.id)).toEqual([b.id]);
  });
});

describe("addRecent", () => {
  it("moves a replayed station to the top without duplicating it", () => {
    const a = st();
    const b = st();
    let list = addRecent([], a, 1);
    list = addRecent(list, b, 2);
    list = addRecent(list, a, 3);
    expect(list.map((r) => [r.station.id, r.playedAt])).toEqual([
      [a.id, 3],
      [b.id, 2],
    ]);
  });

  it(`keeps only the newest ${MAX_RECENTS}`, () => {
    let list: ReturnType<typeof addRecent> = [];
    const first = st();
    list = addRecent(list, first, 0);
    for (let i = 1; i <= MAX_RECENTS; i++) list = addRecent(list, st(), i);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list.some((r) => r.station.id === first.id)).toBe(false);
  });
});

describe("refreshSnapshots", () => {
  it("swaps in fresh data, keeps order, and reports stations no longer listed", () => {
    const a = st({ name: "Old name" });
    const b = st();
    const freshA = { ...a, name: "New name" };
    const { stations, missing } = refreshSnapshots([a, b], [freshA]);
    expect(stations.map((s) => s.name)).toEqual(["New name", b.name]);
    expect([...missing]).toEqual([b.id]);
  });
});

describe("parsing saved data", () => {
  it("round-trips a saved station", () => {
    const s = st();
    expect(parseSavedStation(JSON.parse(JSON.stringify(s)))).toMatchObject({
      id: s.id,
      name: s.name,
      streamUrl: s.streamUrl,
      format: s.format,
      availability: { status: "available" },
    });
  });

  it("does not trust a saved 'available' flag on an http URL", () => {
    const tampered = { ...st(), streamUrl: "http://evil.example/x", availability: { status: "available" } };
    expect(parseSavedStation(tampered)?.availability).toEqual({ status: "unavailable", reason: "insecure-stream" });
  });

  it("drops junk and duplicates instead of crashing", () => {
    const s = st();
    expect(parseFavourites([s, s, null, 5, { id: "x" }, "str"])).toHaveLength(1);
    expect(parseFavourites("not a list")).toEqual([]);
    expect(parseRecents([{ station: s, playedAt: "yesterday" }, { nope: 1 }])).toEqual([
      expect.objectContaining({ playedAt: 0 }),
    ]);
  });

  it("sorts recents newest first", () => {
    const a = st();
    const b = st();
    expect(parseRecents([{ station: a, playedAt: 1 }, { station: b, playedAt: 9 }]).map((r) => r.station.id)).toEqual([
      b.id,
      a.id,
    ]);
  });
});
