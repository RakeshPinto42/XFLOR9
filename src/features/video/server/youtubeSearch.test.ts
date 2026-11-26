import { describe, expect, it, vi } from "vitest";
import { looksLikeLink, parseSearchQuery } from "../search";
import { createRateLimiter } from "./rateLimit";
import { API_URL, YouTubeSearchError, createYouTubeSearch, decodeEntities, quotaDay, toSearchPage } from "./youtubeSearch";

const item = (id: string, title = "A &amp; B &#39;90s") => ({
  id: { kind: "youtube#video", videoId: id },
  snippet: { title, channelTitle: "Channel &quot;X&quot;", publishedAt: "2009-05-01T10:00:00Z", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const fail = (status: number, reason: string) => new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status });

function setup(responses: Response[], over: Partial<Parameters<typeof createYouTubeSearch>[0]> = {}) {
  let t = Date.parse("2026-11-26T12:00:00Z");
  const fetch = vi.fn(async () => responses.shift() ?? ok({ items: [] }));
  const s = createYouTubeSearch({ apiKey: "TEST_KEY_123", fetch: fetch as unknown as typeof globalThis.fetch, now: () => t, dailyLimit: 3, ...over });
  return { s, fetch, advance: (ms: number) => (t += ms) };
}

describe("YouTube search on the server", () => {
  it("asks for embeddable videos only, with the key, and maps the results", async () => {
    const { s, fetch } = setup([ok({ items: [item("dQw4w9WgXcQ")], nextPageToken: "CAoQAA" })]);
    const page = await s.search("old songs", null);
    const url = new URL((fetch.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe(API_URL);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: "video", videoEmbeddable: "true", part: "snippet", q: "old songs", key: "TEST_KEY_123", safeSearch: "moderate" });
    expect(page).toEqual({
      results: [{ videoId: "dQw4w9WgXcQ", title: "A & B '90s", channelTitle: 'Channel "X"', publishedAt: "2009-05-01T10:00:00.000Z", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" }],
      nextPageToken: "CAoQAA",
    });
  });

  it("without a key it never calls Google", async () => {
    const { s, fetch } = setup([], { apiKey: undefined });
    await expect(s.search("x y", null)).rejects.toMatchObject({ code: "not-configured" });
    expect(fetch).not.toHaveBeenCalled();
    expect(s.configured()).toBe(false);
  });

  it("keeps to the daily budget and opens again the next Pacific day", async () => {
    const { s, fetch, advance } = setup([]);
    for (let i = 0; i < 3; i++) await s.search(`q${i}`, null);
    await expect(s.search("one more", null)).rejects.toMatchObject({ code: "daily-limit" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(s.remaining()).toBe(0);
    advance(24 * 3600_000);
    expect(s.remaining()).toBe(3);
    await s.search("new day", null);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("Google's quota answer closes the day; other failures don't", async () => {
    const { s } = setup([fail(500, "backendError"), fail(403, "quotaExceeded")], { dailyLimit: 50 });
    await expect(s.search("aa", null)).rejects.toMatchObject({ code: "unavailable" });
    await expect(s.search("bb", null)).rejects.toMatchObject({ code: "daily-limit" });
    expect(s.remaining()).toBe(0);
  });

  it("network failures and broken JSON are 'unavailable', and errors never carry the key", async () => {
    const { s } = setup([], { fetch: (async () => Promise.reject(new Error("ECONNRESET TEST_KEY_123"))) as unknown as typeof fetch });
    const err = await s.search("aa", null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(YouTubeSearchError);
    expect((err as Error).message).not.toContain("TEST_KEY_123");
    const bad = setup([new Response("<html>", { status: 200 })]);
    await expect(bad.s.search("aa", null)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("drops anything that doesn't validate", () => {
    const page = toSearchPage({
      items: [
        item("dQw4w9WgXcQ"),
        item("dQw4w9WgXcQ"), // duplicate
        { id: { videoId: "bad id!" }, snippet: {} },
        { id: { channelId: "UCxxxxxxxxxxxxxxxxxxxxxx" }, snippet: {} },
        { id: { videoId: "aaaaaaaaaaa" }, snippet: { title: 5, thumbnails: { medium: { url: "http://evil.example/x.jpg" } }, publishedAt: "nonsense" } },
      ],
      nextPageToken: "<script>",
    });
    expect(page.results.map((r) => r.videoId)).toEqual(["dQw4w9WgXcQ", "aaaaaaaaaaa"]);
    expect(page.results[1]).toMatchObject({ title: "Untitled video", thumbnail: null, publishedAt: null });
    expect(page.nextPageToken).toBeNull();
    expect(toSearchPage(null)).toEqual({ results: [], nextPageToken: null });
  });

  it("decodes entities as text and uses the Pacific day", () => {
    expect(decodeEntities("&lt;b&gt; &#x1F3B5; &amp;amp; &unknown;")).toBe("<b> 🎵 &amp; &unknown;");
    expect(quotaDay(Date.parse("2026-11-27T07:59:00Z"))).toBe("2026-11-26");
    expect(quotaDay(Date.parse("2026-11-27T08:01:00Z"))).toBe("2026-11-27");
  });
});

describe("search queries", () => {
  it("normalises text and refuses odd input", () => {
    expect(parseSearchQuery("  old \n hindi   songs ", null)).toEqual({ ok: true, q: "old hindi songs", pageToken: null });
    expect(parseSearchQuery("a", null)).toEqual({ ok: false });
    expect(parseSearchQuery("x".repeat(81), null)).toEqual({ ok: false });
    expect(parseSearchQuery(["x"], null)).toEqual({ ok: false });
    expect(parseSearchQuery("ok query", "CAoQAA")).toEqual({ ok: true, q: "ok query", pageToken: "CAoQAA" });
    expect(parseSearchQuery("ok query", "bad token!")).toEqual({ ok: false });
  });
  it("tells links from searches", () => {
    for (const l of ["https://youtu.be/dQw4w9WgXcQ", "youtube.com/watch?v=dQw4w9WgXcQ", "youtu.be/abc", "www.youtube.com/@x", "example.com/video", "javascript:alert(1)"]) expect(looksLikeLink(l)).toBe(true);
    for (const s of ["doordarshan 1990", "rang de basanti", "a.r. rahman", "kishore kumar songs"]) expect(looksLikeLink(s)).toBe(false);
  });
});

describe("per-visitor rate limit", () => {
  it("allows a burst, then waits for the window", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect([rl.allow("a"), rl.allow("a"), rl.allow("a"), rl.allow("b")]).toEqual([true, true, false, true]);
    t = 1001;
    expect(rl.allow("a")).toBe(true);
  });
  it("forgets the oldest visitors to bound memory", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => 0, maxKeys: 2 });
    rl.allow("a");
    rl.allow("b");
    rl.allow("c"); // "a" is forgotten
    expect(rl.allow("a")).toBe(true);
  });
});
