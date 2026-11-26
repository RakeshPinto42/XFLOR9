import { describe, expect, it } from "vitest";
import { parseYouTubeLink, uploadsPlaylist } from "./youtubeLink";

const id = "dQw4w9WgXcQ";

describe("pasted YouTube links", () => {
  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
  ])("plays the video in %s", (link) => {
    expect(parseYouTubeLink(link)).toEqual({ ok: true, source: { provider: "youtube", videoId: id } });
  });

  it("plays a playlist when there is no video", () => {
    expect(parseYouTubeLink("https://www.youtube.com/playlist?list=PLabcdefghijklmnop")).toEqual({
      ok: true,
      source: { provider: "youtube-playlist", playlistId: "PLabcdefghijklmnop" },
    });
  });

  it.each([
    ["", "Paste"],
    ["https://evil.example/watch?v=dQw4w9WgXcQ", "Only links"],
    ["https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "Only links"],
    ["javascript:alert(1)", "web address"],
    ["https://www.youtube.com/watch?v=bad", "No video"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload", "No video"],
    ["https://www.youtube.com/@DDARCHIVES", "channel page"],
    ["x".repeat(3000), "too long"],
  ])("refuses %s", (link, reason) => {
    const r = parseYouTubeLink(link);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });

  it("turns a channel id into its uploads playlist", () => {
    expect(uploadsPlaylist("UCWxqSvqiH8PGpSNPSVtFwGw")).toBe("UUWxqSvqiH8PGpSNPSVtFwGw");
    expect(() => uploadsPlaylist("UU123")).toThrow();
  });
});

describe("saved videos (History, Favourites)", async () => {
  const { parseSavedVideos, rememberVideo, toggleSavedVideo, MAX_SAVED_VIDEOS } = await import("./youtubeLink");
  const v = (id: string) => ({ key: id, title: `T ${id}`, by: "Ch", source: { provider: "youtube" as const, videoId: id } });

  it("re-checks every saved source and drops anything unsafe", () => {
    const raw = [
      v("dQw4w9WgXcQ"),
      { key: "x", title: "bad", source: { provider: "youtube", videoId: "javascript:alert(1)" } },
      { title: "list", source: { provider: "youtube-playlist", playlistId: "PLabcdefghijklmnop" } },
      { source: { provider: "archive", identifier: "x" } },
      v("dQw4w9WgXcQ"),
      "junk",
    ];
    const out = parseSavedVideos(raw);
    expect(out.map((x) => x.key)).toEqual(["dQw4w9WgXcQ", "PLabcdefghijklmnop"]);
    expect(out[1].title).toBe("list");
    expect(out[1].by).toBe("YouTube");
    expect(parseSavedVideos(null)).toEqual([]);
  });

  it("history is newest first without duplicates; favourites toggle", () => {
    let h = rememberVideo([], v("aaaaaaaaaaa"));
    h = rememberVideo(h, v("bbbbbbbbbbb"));
    h = rememberVideo(h, v("aaaaaaaaaaa"));
    expect(h.map((x) => x.key)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(toggleSavedVideo(h, v("aaaaaaaaaaa")).map((x) => x.key)).toEqual(["bbbbbbbbbbb"]);
    const many = Array.from({ length: MAX_SAVED_VIDEOS + 5 }, (_, i) => v(String(i).padStart(11, "x")));
    expect(many.reduce(rememberVideo, [] as ReturnType<typeof v>[])).toHaveLength(MAX_SAVED_VIDEOS);
  });
});
