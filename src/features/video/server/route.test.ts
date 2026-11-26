import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeSearchError } from "./youtubeSearch";

const state = { configured: true, allow: true };
vi.mock("./searchService", () => ({
  cachedSearch: vi.fn(),
  youtubeSearch: { configured: () => state.configured },
  searchRateLimit: { allow: vi.fn(() => state.allow) },
}));
const { cachedSearch, searchRateLimit } = await import("./searchService");
const route = await import("@/app/api/video/search/route");

const req = (qs: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost/api/video/search${qs}`, { headers });

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  state.allow = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/video/search", () => {
  it("returns results with a private cache header; the query is normalised", async () => {
    const page = { results: [], nextPageToken: null };
    vi.mocked(cachedSearch).mockResolvedValue(page);
    const res = await route.GET(req("?q=%20Old%20%20Songs%20&pageToken=CAoQAA", { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(cachedSearch).toHaveBeenCalledWith("old songs", "CAoQAA");
    expect(searchRateLimit.allow).toHaveBeenCalledWith("203.0.113.9");
  });

  it("says when search isn't set up, without touching anything else", async () => {
    state.configured = false;
    const res = await route.GET(req("?q=hello"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "not-configured" } });
    expect(cachedSearch).not.toHaveBeenCalled();
  });

  it("refuses bad queries and too many requests before spending quota", async () => {
    expect((await route.GET(req("?q=a"))).status).toBe(400);
    expect((await route.GET(req("?q=hello&pageToken=%3Cx%3E"))).status).toBe(400);
    state.allow = false;
    const limited = await route.GET(req("?q=hello"));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "rate-limited" } });
    expect(cachedSearch).not.toHaveBeenCalled();
  });

  it("maps service errors to clear responses", async () => {
    vi.mocked(cachedSearch).mockRejectedValueOnce(new YouTubeSearchError("daily-limit"));
    const a = await route.GET(req("?q=hello"));
    expect(a.status).toBe(429);
    expect(await a.json()).toMatchObject({ error: { code: "daily-limit" } });
    vi.mocked(cachedSearch).mockRejectedValueOnce(new Error("boom"));
    const b = await route.GET(req("?q=hello"));
    expect(b.status).toBe(502);
    expect(b.headers.get("Cache-Control")).toBe("no-store");
  });
});
