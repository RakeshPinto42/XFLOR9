import { describe, expect, it } from "vitest";
import { LIVE_STATION, rawStation } from "./__fixtures__/stations";
import { normalizeStation } from "./station";

describe("normalizeStation", () => {
  it("maps a real live record to an available MP3 station", () => {
    const s = normalizeStation(LIVE_STATION);
    expect(s).toMatchObject({
      id: "e928bf7b-7de2-4447-87ec-369d1be1b9f5",
      name: "Bollywood Gaane Purane",
      streamUrl: "https://stream.zeno.fm/6n6ewddtad0uv",
      countryCode: "IN",
      format: "mp3",
      bitrate: 128,
      languages: [],
      tags: [],
      availability: { status: "available" },
    });
  });

  it("does not treat https alone as available", () => {
    const failing = normalizeStation(rawStation({ lastcheckok: 0 }));
    const badCert = normalizeStation(rawStation({ ssl_error: 1 }));
    const playlist = normalizeStation(rawStation({ url_resolved: "https://example.com/live.pls" }));
    expect(failing?.availability).toEqual({ status: "unavailable", reason: "failing-check" });
    expect(badCert?.availability).toEqual({ status: "unavailable", reason: "certificate-error" });
    expect(playlist?.availability).toEqual({ status: "unavailable", reason: "playlist-file" });
  });

  it("marks http streams as insecure even when everything else is fine", () => {
    const s = normalizeStation(rawStation({ url_resolved: "http://example.com/stream" }));
    expect(s?.availability).toEqual({ status: "unavailable", reason: "insecure-stream" });
  });

  it("rejects non-web and malformed stream URLs", () => {
    expect(normalizeStation(rawStation({ url_resolved: "javascript:alert(1)", url: "" }))?.availability).toEqual({
      status: "unavailable",
      reason: "invalid-url",
    });
    expect(normalizeStation(rawStation({ url_resolved: "", url: "" }))?.availability.status).toBe("unavailable");
  });

  it("falls back to url when url_resolved is empty", () => {
    expect(normalizeStation(rawStation({ url_resolved: "", url: "https://example.com/a" }))?.streamUrl).toBe(
      "https://example.com/a",
    );
  });

  it("detects HLS from the hls flag or the .m3u8 extension, whatever the codec says", () => {
    // Verified live: "clubmirchi" reports codec AAC+ but streams HLS.
    expect(normalizeStation(rawStation({ hls: 1, codec: "AAC+" }))?.format).toBe("hls");
    expect(normalizeStation(rawStation({ url_resolved: "https://x.example/live/a.m3u8?t=1" }))?.format).toBe("hls");
  });

  it("maps codec labels to formats", () => {
    const fmt = (codec: string) => normalizeStation(rawStation({ codec }))?.format;
    expect(fmt("AAC+")).toBe("aac");
    expect(fmt("aac")).toBe("aac");
    expect(fmt("OGG")).toBe("ogg");
    expect(fmt("UNKNOWN")).toBe("unknown");
    expect(fmt("")).toBe("unknown");
  });

  it("returns null for records without a valid id or name", () => {
    expect(normalizeStation(null)).toBeNull();
    expect(normalizeStation([])).toBeNull();
    expect(normalizeStation(rawStation({ stationuuid: "123" }))).toBeNull();
    expect(normalizeStation(rawStation({ name: "   " }))).toBeNull();
  });

  it("tolerates wrong field types instead of crashing", () => {
    const s = normalizeStation(rawStation({ bitrate: "128", votes: null, tags: 5, lastcheckok: "1" }));
    expect(s?.bitrate).toBeNull();
    expect(s?.votes).toBe(0);
    expect(s?.tags).toEqual([]);
    expect(s?.availability.status).toBe("unavailable"); // "1" as a string is not a passed check
  });

  it("keeps only https favicons and web homepages", () => {
    expect(normalizeStation(rawStation({ favicon: "http://x.example/i.png" }))?.favicon).toBeNull();
    expect(normalizeStation(rawStation({ homepage: "javascript:void(0)" }))?.homepage).toBeNull();
  });

  it("cleans tag and language lists", () => {
    const s = normalizeStation(rawStation({ tags: "Bollywood, bollywood ,,Retro", language: "hindi,english" }));
    expect(s?.tags).toEqual(["bollywood", "retro"]);
    expect(s?.languages).toEqual(["hindi", "english"]);
  });
});
