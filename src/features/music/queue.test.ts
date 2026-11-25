import { describe, expect, it } from "vitest";
import officialRaw from "../../../content/media/official-sources.json";
import raw from "../../../content/music/catalogue.json";
import { parseOfficialChannels } from "@/features/media/catalogue";
import { parseMusicCatalogue } from "./catalogue";
import { neighbour, parseTrackId, trackSource } from "./queue";

const cassettes = parseMusicCatalogue(raw, parseOfficialChannels(officialRaw));
const old = cassettes.find((c) => c.id === "old-records")!;

describe("Music queue", () => {
  it("makes a track source for the shared player, and reads it back", () => {
    const s = trackSource(old, old.tracks[0]);
    expect(s).toMatchObject({ id: "music:old-records:aye-garjat", kind: "music", live: false });
    expect(s.url).toBe("https://archive.org/download/garjat-aaye/garjat%20aaye.mp3");
    expect(parseTrackId(s.id)).toEqual({ cassetteId: "old-records", trackId: "aye-garjat" });
    expect(parseTrackId("radio:abc")).toBeNull();
  });
  it("moves along the tape and stops at its ends", () => {
    expect(neighbour(old, "aye-garjat", 1)?.id).toBe(old.tracks[1].id);
    expect(neighbour(old, "aye-garjat", -1)).toBeNull();
    expect(neighbour(old, old.tracks.at(-1)!.id, 1)).toBeNull();
  });
  it("refuses to treat a video track as audio", () => {
    expect(() => trackSource(cassettes[0], cassettes[0].tracks[0])).toThrow(/not an audio track/);
  });
});
