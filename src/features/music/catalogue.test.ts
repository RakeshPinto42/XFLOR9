import { describe, expect, it } from "vitest";
import officialRaw from "../../../content/media/official-sources.json";
import raw from "../../../content/music/catalogue.json";
import { archiveAudioUrl, MediaCatalogueError, parseOfficialChannels } from "@/features/media/catalogue";
import { cassettePlayback, parseMusicCatalogue } from "./catalogue";

const official = parseOfficialChannels(officialRaw);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests break the file in arbitrary ways
const problems = (mutate: (c: any) => void) => {
  const c = JSON.parse(JSON.stringify(raw));
  mutate(c);
  try {
    parseMusicCatalogue(c, official);
    return [];
  } catch (e) {
    return (e as MediaCatalogueError).problems;
  }
};

describe("the real Music catalogue", () => {
  const cassettes = parseMusicCatalogue(raw, official);
  it("validates: video cassettes from allow-listed labels, and a public-domain audio cassette", () => {
    expect(cassettes.length).toBeGreaterThanOrEqual(4);
    expect(cassettes.filter((c) => cassettePlayback(c) === "video").length).toBeGreaterThanOrEqual(3);
    const old = cassettes.find((c) => cassettePlayback(c) === "audio")!;
    expect(old.tracks.every((t) => t.rights.basis === "public-domain" && t.year !== null && t.year <= 1925)).toBe(true);
  });
});

describe("Music catalogue rules", () => {
  it("refuses a cassette that mixes YouTube and Internet Archive audio", () => {
    expect(
      problems((c) => {
        c.cassettes[0].tracks.push(c.cassettes[3].tracks[0]);
        c.cassettes[0].tracks[7].id = "moved";
      }),
    ).toContain("cassette[0] (rainy-day-romance): all tracks on a cassette must play the same way (all YouTube or all Internet Archive audio)");
  });
  it("refuses film embeds as tracks, unsafe file names, and bad colours", () => {
    expect(problems((c) => (c.cassettes[3].tracks[0].source = { provider: "archive", identifier: "garjat-aaye" }))).toContain(
      "cassette[3] (old-records).track[0] (aye-garjat): a track plays from a YouTube video or an Internet Archive audio file",
    );
    for (const file of ["../secret.mp3", "a/b.mp3", "a\b.mp3", "x.wav", "bad\u0000name.mp3"])
      expect(problems((c) => (c.cassettes[3].tracks[0].source.file = file))).toContain(
        "cassette[3] (old-records).track[0] (aye-garjat): source.file must be an .mp3 file name in the item (no folders)",
      );
    expect(problems((c) => (c.cassettes[0].colours.shell = "red"))).toContain('cassette[0] (rainy-day-romance): colours.shell and colours.label must be like "#a1b2c3"');
  });
  it("accepts the real file names, including spaces, # and Devanagari", () => {
    expect(problems(() => {})).toEqual([]);
  });
  it("refuses songs from channels that aren't on the allow-list", () => {
    expect(problems((c) => (c.cassettes[0].tracks[0].rights.uploaderChannelId = "UCxxxxxxxxxxxxxxxxxxxxxx"))).toContain(
      "cassette[0] (rainy-day-romance).track[0] (dheere-dheere): uploader UCxxxxxxxxxxxxxxxxxxxxxx is not on the official channel allow-list",
    );
  });
});

describe("audio addresses", () => {
  it("encode the file name safely", () => {
    expect(archiveAudioUrl({ identifier: "garjat-aaye", file: "garjat aaye.mp3" })).toBe("https://archive.org/download/garjat-aaye/garjat%20aaye.mp3");
    expect(archiveAudioUrl({ identifier: "x", file: "#3053#_a.mp3" })).toBe("https://archive.org/download/x/%233053%23_a.mp3");
  });
});
