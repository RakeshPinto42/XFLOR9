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
