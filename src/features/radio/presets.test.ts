import { describe, expect, it } from "vitest";
import { rawStation } from "./__fixtures__/stations";
import { EMPTY_PRESETS, PRESET_COUNT, clearPreset, parsePresets, presetSlot, sortStations, storePreset } from "./presets";
import { normalizeStation } from "./station";
import type { Station } from "./types";

const st = (overrides: Record<string, unknown> = {}) => normalizeStation(rawStation(overrides)) as Station;

describe("tuner presets", () => {
  const a = st({ stationuuid: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alpha FM" });
  const b = st({ stationuuid: "bbbbbbbb-0000-4000-8000-000000000002", name: "Beta Radio" });

  it("stores a station in a slot and finds it again", () => {
    const p = storePreset(EMPTY_PRESETS, 2, a);
    expect(p[2]?.id).toBe(a.id);
    expect(presetSlot(p, a.id)).toBe(2);
    expect(presetSlot(p, b.id)).toBe(-1);
  });

  it("storing the same station elsewhere moves it; other slots are untouched", () => {
    let p = storePreset(EMPTY_PRESETS, 0, a);
    p = storePreset(p, 1, b);
    p = storePreset(p, 4, a);
    expect(p.map((s) => s?.id ?? null)).toEqual([null, b.id, null, null, a.id, null]);
  });

  it("clears a slot and ignores slots out of range", () => {
    const p = storePreset(EMPTY_PRESETS, 0, a);
    expect(clearPreset(p, 0)).toEqual(EMPTY_PRESETS);
    expect(storePreset(p, 9, b)).toBe(p);
  });

  it("repairs saved presets: always six slots, invalid entries emptied", () => {
    expect(parsePresets(null)).toEqual(EMPTY_PRESETS);
    const parsed = parsePresets([a, "junk", { name: "no id" }, null, b, b, b, b]);
    expect(parsed).toHaveLength(PRESET_COUNT);
    expect(parsed.map((s) => s?.id ?? null)).toEqual([a.id, null, null, null, b.id, b.id]);
  });
});

describe("station table sorting", () => {
  const list = [
    st({ stationuuid: "aaaaaaaa-0000-4000-8000-000000000001", name: "Zee", country: "India", bitrate: 64 }),
    st({ stationuuid: "bbbbbbbb-0000-4000-8000-000000000002", name: "alpha", country: "Austria", bitrate: 0 }),
    st({ stationuuid: "cccccccc-0000-4000-8000-000000000003", name: "Mid", country: "Bhutan", bitrate: 128 }),
  ];
  it("sorts by name, country and bitrate, both ways, without changing the input", () => {
    expect(sortStations(list, "name", false).map((s) => s.name)).toEqual(["alpha", "Mid", "Zee"]);
    expect(sortStations(list, "country", true).map((s) => s.country)).toEqual(["India", "Bhutan", "Austria"]);
    // Unknown bitrate sorts lowest.
    expect(sortStations(list, "bitrate", true).map((s) => s.bitrate)).toEqual([128, 64, null]);
    expect(sortStations(list, "rank", false)).toEqual(list);
    expect(list[0].name).toBe("Zee");
  });
});
