import { describe, expect, it } from "vitest";
import { parseArcadePrefs, parseBest, playedGame, recordMinesWin, recordSaanpScore } from "./scores";

describe("arcade best results", () => {
  it("reads old saves: the single Mines best becomes the Beginner best", () => {
    expect(parseBest({ saanp: 3, minesSeconds: 42 })).toEqual({ saanp: 3, mines: { beginner: 42, intermediate: null, expert: null } });
  });
  it("drops anything malformed", () => {
    expect(parseBest({ saanp: -5, mines: { beginner: "7", intermediate: Number.NaN, expert: 0 } })).toEqual({
      saanp: 0,
      mines: { beginner: null, intermediate: null, expert: null },
    });
    expect(parseBest(null).saanp).toBe(0);
  });
  it("keeps only better results", () => {
    const b = parseBest({ saanp: 10 });
    expect(recordSaanpScore(b, 4)).toBe(b);
    expect(recordSaanpScore(b, 12).saanp).toBe(12);
    const won = recordMinesWin(b, "expert", 300);
    expect(won.mines.expert).toBe(300);
    expect(recordMinesWin(won, "expert", 400)).toBe(won);
    expect(recordMinesWin(won, "expert", 250).mines.expert).toBe(250);
  });
  it("settings fall back field by field; recently played stays unique", () => {
    expect(parseArcadePrefs({ level: "constructor", speed: "fast", recent: ["mines", "x", "mines", "saanp"] })).toEqual({ level: "beginner", speed: "fast", recent: ["mines", "saanp"] });
    expect(playedGame(parseArcadePrefs({ recent: ["mines", "saanp"] }), "saanp").recent).toEqual(["saanp", "mines"]);
  });
});
