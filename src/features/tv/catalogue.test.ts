import { describe, expect, it } from "vitest";
import officialRaw from "../../../content/media/official-sources.json";
import raw from "../../../content/tv/catalogue.json";
import { embedUrl, MediaCatalogueError, parseOfficialChannels, sourcePage } from "@/features/media/catalogue";
import { allProgrammes, parseTvCatalogue } from "./catalogue";

const official = parseOfficialChannels(officialRaw);
const clone = () => JSON.parse(JSON.stringify(raw));
const problems = (mutate: (c: ReturnType<typeof clone>) => void) => {
  const c = clone();
  mutate(c);
  try {
    parseTvCatalogue(c, official);
    return [];
  } catch (e) {
    return (e as MediaCatalogueError).problems;
  }
};

describe("the real TV catalogue", () => {
  const tv = parseTvCatalogue(raw, official);
  it("validates, with channels, programmes and a guide", () => {
    expect(tv.channels.length).toBeGreaterThanOrEqual(4);
    expect(allProgrammes(tv).length).toBeGreaterThanOrEqual(20);
    expect(tv.guide.length).toBeGreaterThan(0);
  });
  it("YouTube items come only from allow-listed channels; Archive items are public domain", () => {
    for (const { programme: p } of allProgrammes(tv)) {
      if (p.source.provider === "archive") expect(p.rights.basis).toBe("public-domain");
      else expect(p.rights.basis === "official-upload" && official.has(p.rights.uploaderChannelId)).toBe(true);
    }
  });
});

describe("catalogue rules", () => {
  it("refuses an uploader that isn't on the allow-list (re-uploads)", () => {
    expect(problems((c) => (c.channels[0].programmes[0].rights.uploaderChannelId = "UCxxxxxxxxxxxxxxxxxxxxxx"))).toEqual([
      "channel[0] (story-hour).programme[0] (tehreer): uploader UCxxxxxxxxxxxxxxxxxxxxxx is not on the official channel allow-list",
    ]);
  });
  it("refuses mismatched rights and sources", () => {
    const archive = (c: ReturnType<typeof clone>) => c.channels[3].programmes[0];
    expect(problems((c) => (archive(c).source = { provider: "youtube", videoId: "bI376UnsUMg" }))).toContain(
      "channel[3] (picture-house).programme[0] (raja-harishchandra): public-domain items must play from the Internet Archive",
    );
    expect(problems((c) => (c.channels[0].programmes[0].source = { provider: "archive", identifier: "college" }))).toContain(
      "channel[0] (story-hour).programme[0] (tehreer): official uploads must play from YouTube",
    );
  });
  it("refuses malformed ids, duplicate ids, missing evidence and non-https guide links", () => {
    expect(problems((c) => (c.channels[1].programmes[0].source.videoId = "x"))).toContain(
      "channel[1] (cartoon-time).programme[0] (ek-anek-aur-ekta): source.videoId must be an 11-character YouTube id",
    );
    expect(problems((c) => (c.channels[1].programmes[1].id = "tehreer"))).toContain("channel[1] (cartoon-time).programme[1] (tehreer): id is used twice");
    expect(problems((c) => (c.channels[0].programmes[0].rights.evidence = []))).toContain(
      "channel[0] (story-hour).programme[0] (tehreer): at least one piece of evidence (claim + https source)",
    );
    expect(problems((c) => (c.guide[0].watch[0].url = "http://example.com"))).toContain(
      "guide[0] (malgudi-days): watch needs at least one platform with an https link and an access type",
    );
    expect(problems((c) => (c.channels[3].programmes[0].rights.india = ""))).toContain(
      "channel[3] (picture-house).programme[0] (raja-harishchandra): public domain needs the India and US basis",
    );
  });
});

describe("embed addresses", () => {
  const origin = "https://xplor9.example";
  it("YouTube uses the reduced-cookie domain with the JS API, never autoplaying unless asked", () => {
    const u = new URL(embedUrl({ provider: "youtube", videoId: "bI376UnsUMg" }, origin, { autoplay: false }));
    expect(u.origin).toBe("https://www.youtube-nocookie.com");
    expect(u.pathname).toBe("/embed/bI376UnsUMg");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ enablejsapi: "1", origin, autoplay: "0", rel: "0" });
    const pl = new URL(embedUrl({ provider: "youtube-playlist", playlistId: "PLqtVCj5iilH4w0Y8KBB4fqBu25T0sGhXG" }, origin, { autoplay: true }));
    expect(pl.pathname).toBe("/embed/videoseries");
    expect(pl.searchParams.get("list")).toBe("PLqtVCj5iilH4w0Y8KBB4fqBu25T0sGhXG");
    expect(pl.searchParams.get("autoplay")).toBe("1");
  });
  it("Internet Archive embeds and source pages", () => {
    expect(embedUrl({ provider: "archive", identifier: "college" }, origin, { autoplay: false })).toBe("https://archive.org/embed/college");
    expect(sourcePage({ provider: "archive", identifier: "college" })).toBe("https://archive.org/details/college");
    expect(sourcePage({ provider: "youtube", videoId: "bI376UnsUMg" })).toBe("https://www.youtube.com/watch?v=bI376UnsUMg");
  });
});

describe("official channel list", () => {
  it("refuses entries without evidence or with a malformed id", () => {
    const c = JSON.parse(JSON.stringify(officialRaw));
    c.youtube[0].evidence = [];
    c.youtube[1].channelId = "nope";
    expect(() => parseOfficialChannels(c)).toThrow(MediaCatalogueError);
  });
});
