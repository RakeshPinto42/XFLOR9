import { describe, expect, it, vi } from "vitest";
import { createRadioBrowserClient, RadioBrowserError, USER_AGENT, type ClientDeps } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(overrides: Partial<ClientDeps> = {}) {
  const deps: ClientDeps = {
    resolveSrv: vi.fn(async () => [{ name: "de1.api.radio-browser.info" }, { name: "fi1.api.radio-browser.info" }]),
    fetch: vi.fn(async () => json([])),
    now: () => 0,
    random: () => 0.99, // keeps SRV order stable for assertions
    ...overrides,
  };
  return { deps, client: createRadioBrowserClient(deps) };
}

const hostOf = (call: unknown[]) => new URL(String(call[0])).host;

describe("server discovery", () => {
  it("uses SRV hosts first and the all.api host as last resort", async () => {
    const { client } = setup();
    const hosts = await client.getServers();
    expect(hosts).toHaveLength(3);
    expect(hosts).toContain("de1.api.radio-browser.info");
    expect(hosts.at(-1)).toBe("all.api.radio-browser.info");
  });

  it("ignores hosts outside radio-browser.info", async () => {
    const { client } = setup({ resolveSrv: async () => [{ name: "evil.example.com" }] });
    expect(await client.getServers()).toEqual(["all.api.radio-browser.info"]);
  });

  it("falls back to the API's /json/servers list when SRV lookup fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
      json([
        { ip: "91.98.4.78", name: "de1.api.radio-browser.info" },
        { ip: "2a01:4f8:1c1d:699::1", name: "de1.api.radio-browser.info" }, // same host, IPv6
        { ip: "1.2.3.4", name: "evil.example.com" },
      ]),
    );
    const { client } = setup({ resolveSrv: async () => Promise.reject(new Error("ECONNREFUSED")), fetch });
    expect(await client.getServers()).toEqual(["de1.api.radio-browser.info", "all.api.radio-browser.info"]);
    expect(String(fetch.mock.calls[0][0])).toBe("https://all.api.radio-browser.info/json/servers");
  });

  it("still works when both discovery methods fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = setup({
      resolveSrv: async () => Promise.reject(new Error("ENOTFOUND")),
      fetch: async () => Promise.reject(new TypeError("offline")),
    });
    expect(await client.getServers()).toEqual(["all.api.radio-browser.info"]);
  });

  it("caches the server list", async () => {
    const { client, deps } = setup();
    await client.getServers();
    await client.getServers();
    expect(deps.resolveSrv).toHaveBeenCalledTimes(1);
  });
});

describe("getJson failover", () => {
  it("sends the agreed User-Agent over https", async () => {
    const { client, deps } = setup();
    await client.getJson("/json/stats");
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\//);
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("moves to the next server after a network error or 5xx", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    const { client } = setup({ fetch });
    await expect(client.getJson("/json/stats")).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls.map(hostOf)).toHaveLength(3);
    expect(new Set(fetch.mock.calls.map(hostOf)).size).toBe(3);
  });

  it("remembers the server that worked", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError("down"))
      .mockImplementation(async () => json([])); // fresh Response each call: a body can be read once
    const { client } = setup({ fetch });
    await client.getJson("/a");
    const good = hostOf(fetch.mock.calls[1]);
    await client.getJson("/b");
    expect(hostOf(fetch.mock.calls[2])).toBe(good);
  });

  it("does not retry other servers when the request itself is wrong (4xx)", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("", { status: 404 }));
    const { client } = setup({ fetch });
    const err = await client.getJson("/json/url/x").catch((e) => e);
    expect(err).toBeInstanceOf(RadioBrowserError);
    expect(err).toMatchObject({ code: "bad-request", status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats invalid JSON as a server failure", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("<html>", { status: 200 }))
      .mockImplementation(async () => json([1]));
    const { client } = setup({ fetch });
    await expect(client.getJson("/x")).resolves.toEqual([1]);
  });

  it("throws 'unreachable' when every server fails, and rediscovers next time", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("offline"));
    const { client, deps } = setup({ fetch });
    await expect(client.getJson("/x")).rejects.toMatchObject({ code: "unreachable" });
    expect(fetch).toHaveBeenCalledTimes(3);
    await client.getJson("/x").catch(() => {});
    expect(deps.resolveSrv).toHaveBeenCalledTimes(2);
  });
});
