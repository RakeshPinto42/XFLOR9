import { describe, expect, it } from "vitest";
import { DEFAULT_EQ, EQ_BANDS, EQ_PRESETS, bandLabel, parseEq, presetName } from "./eq";
import { EMPTY_PLAYLIST, MAX_ITEMS, append, clear, clock, move, parsePlaylist, removeAt, replaceAll, step, type Playlist } from "./playlist";

const list = (over: Partial<Playlist> = {}): Playlist => ({ items: ["a", "b", "c", "d"], index: 1, shuffle: false, repeat: "off", ...over });

describe("what plays next", () => {
  it("moves along the list and stops at either end without repeat", () => {
    expect(step(list(), 1, { auto: true })).toBe(2);
    expect(step(list({ index: 3 }), 1, { auto: true })).toBe(-1);
    expect(step(list({ index: 0 }), -1, { auto: false })).toBe(-1);
  });
  it("repeat all wraps around; repeat one replays only when a song ends by itself", () => {
    expect(step(list({ index: 3, repeat: "all" }), 1, { auto: true })).toBe(0);
    expect(step(list({ index: 0, repeat: "all" }), -1, { auto: false })).toBe(3);
    expect(step(list({ repeat: "one" }), 1, { auto: true })).toBe(1);
    expect(step(list({ repeat: "one" }), 1, { auto: false })).toBe(2);
  });
  it("passes over songs that couldn't play", () => {
    expect(step(list(), 1, { auto: true, skip: new Set(["c"]) })).toBe(3);
    expect(step(list({ repeat: "all" }), 1, { auto: true, skip: new Set(["a", "c", "d"]) })).toBe(1);
    expect(step(list(), 1, { auto: true, skip: new Set(["a", "b", "c", "d"]) })).toBe(-1);
  });
  it("shuffle picks another playable song at random", () => {
    const p = list({ shuffle: true });
    expect(step(p, 1, { auto: true, random: () => 0 })).toBe(0);
    expect(step(p, 1, { auto: true, random: () => 0.99 })).toBe(3);
    expect(step(p, 1, { auto: true, skip: new Set(["a", "c", "d"]), random: () => 0 })).toBe(-1);
  });
  it("an empty list plays nothing", () => {
    expect(step(EMPTY_PLAYLIST, 1, { auto: true })).toBe(-1);
  });
});

describe("editing the list", () => {
  it("appending to an empty list selects the first song", () => {
    expect(append(EMPTY_PLAYLIST, ["x", "y"])).toMatchObject({ items: ["x", "y"], index: 0 });
    expect(append(list(), ["e"]).index).toBe(1);
  });
  it("removing keeps the current song's place", () => {
    expect(removeAt(list(), 0)).toMatchObject({ items: ["b", "c", "d"], index: 0 });
    expect(removeAt(list(), 3)).toMatchObject({ index: 1 });
    expect(removeAt(list({ index: 3 }), 3)).toMatchObject({ items: ["a", "b", "c"], index: 2 });
    expect(removeAt(list({ items: ["a"], index: 0 }), 0)).toMatchObject({ items: [], index: -1 });
    expect(removeAt(list(), 9)).toEqual(list());
  });
  it("moving swaps neighbours and follows the current song", () => {
    expect(move(list(), 1, -1)).toMatchObject({ items: ["b", "a", "c", "d"], index: 0 });
    expect(move(list(), 2, -1)).toMatchObject({ items: ["a", "c", "b", "d"], index: 2 });
    expect(move(list(), 3, 1)).toEqual(list());
  });
  it("replace and clear", () => {
    expect(replaceAll(list(), ["x", "y", "z"], 2)).toMatchObject({ items: ["x", "y", "z"], index: 2 });
    expect(clear(list())).toMatchObject({ items: [], index: -1, repeat: "off" });
  });
  it("never grows past the limit", () => {
    expect(append(EMPTY_PLAYLIST, Array.from({ length: MAX_ITEMS + 10 }, (_, i) => `t${i}`)).items).toHaveLength(MAX_ITEMS);
  });
});

describe("saved playlist", () => {
  it("keeps only known tracks and repairs the position", () => {
    const known = new Set(["a", "b"]);
    expect(parsePlaylist({ items: ["a", "zz", 3, "b"], index: 7, shuffle: true, repeat: "sometimes" }, known)).toEqual({ items: ["a", "b"], index: 0, shuffle: true, repeat: "off" });
    expect(parsePlaylist(null, known)).toEqual(EMPTY_PLAYLIST);
  });
});

describe("clock", () => {
  it("formats seconds as the player shows them", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(83.9)).toBe("1:23");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(null)).toBe("--:--");
    expect(clock(Number.NaN)).toBe("--:--");
  });
});

describe("equaliser settings", () => {
  it("every preset has one value per band, within ±12 dB", () => {
    for (const g of Object.values(EQ_PRESETS)) {
      expect(g).toHaveLength(EQ_BANDS.length);
      expect(g.every((v) => Math.abs(v) <= 12)).toBe(true);
    }
  });
  it("repairs saved settings and clamps values", () => {
    expect(parseEq(null)).toEqual(DEFAULT_EQ);
    expect(parseEq({ enabled: false, preamp: 40, gains: [1, 2, 3] })).toEqual({ ...DEFAULT_EQ, enabled: false, preamp: 12 });
    expect(parseEq({ gains: EQ_BANDS.map(() => -99) }).gains.every((g) => g === -12)).toBe(true);
  });
  it("names a matching preset and labels bands", () => {
    expect(presetName(EQ_PRESETS["Bass boost"])).toBe("Bass boost");
    expect(presetName([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(EQ_BANDS.map(bandLabel)).toEqual(["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"]);
  });
});
