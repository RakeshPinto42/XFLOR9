import { resolveSrv } from "node:dns/promises";

/**
 * Radio Browser HTTP client with server discovery and failover.
 *
 * Discovery follows the official guidance (api.radio-browser.info): look up the SRV record
 * `_api._tcp.radio-browser.info` for the current server names (or, if DNS fails, ask the API's
 * /json/servers list), shuffle them to spread load, and try the next one if a request fails.
 * `all.api.radio-browser.info` is always the last resort.
 * As of Nov 2026 only one server (de1) is listed, so failover has little to fail over to today,
 * but new servers are picked up automatically.
 */

export const USER_AGENT = "XPLOR9/0.1"; // the API asks for a descriptive agent string
const SRV_RECORD = "_api._tcp.radio-browser.info";
const FALLBACK_HOST = "all.api.radio-browser.info";
const TRUSTED_HOST = /^[a-z0-9-]+\.api\.radio-browser\.info$/i;
const SERVER_LIST_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

export type RadioBrowserErrorCode = "unreachable" | "bad-request" | "bad-response";

export class RadioBrowserError extends Error {
  constructor(
    readonly code: RadioBrowserErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RadioBrowserError";
  }
}

export interface ClientDeps {
  resolveSrv: (name: string) => Promise<{ name: string }[]>;
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
}

export interface RadioBrowserClient {
  getJson(path: string, params?: URLSearchParams): Promise<unknown>;
  getServers(): Promise<string[]>;
}

export function createRadioBrowserClient(deps: ClientDeps): RadioBrowserClient {
  let cached: { hosts: string[]; at: number } | null = null;

  async function getServers(): Promise<string[]> {
    if (cached && deps.now() - cached.at < SERVER_LIST_TTL_MS) return cached.hosts;
    let names: string[] = [];
    try {
      names = (await deps.resolveSrv(SRV_RECORD)).map((r) => r.name);
    } catch (err) {
      // Seen in practice: Node's SRV lookup fails on some Windows/VPN setups even when
      // the system resolver works. Fall back to the API's own server list.
      console.warn("[radio] SRV discovery failed, using /json/servers:", err instanceof Error ? err.message : err);
      names = await fetchServerList();
    }
    // Only trust hosts inside radio-browser.info, whatever DNS or the API says.
    const discovered = shuffle(
      [...new Set(names.map((n) => n.toLowerCase()))].filter((h) => TRUSTED_HOST.test(h) && h !== FALLBACK_HOST),
      deps.random,
    );
    const hosts = [...discovered, FALLBACK_HOST];
    cached = { hosts, at: deps.now() };
    return hosts;
  }

  /** Verified live: GET /json/servers returns [{ ip, name }, ...]. Empty list on any failure. */
  async function fetchServerList(): Promise<string[]> {
    try {
      const res = await deps.fetch(`https://${FALLBACK_HOST}/json/servers`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: unknown = res.ok ? await res.json() : [];
      return Array.isArray(body)
        ? body.flatMap((s) => (typeof s?.name === "string" ? [s.name as string] : []))
        : [];
    } catch {
      return [];
    }
  }

  /** Moves a host that just worked to the front, so later requests skip known-bad servers. */
  function prefer(host: string) {
    if (cached && cached.hosts[0] !== host) cached.hosts = [host, ...cached.hosts.filter((h) => h !== host)];
  }

  async function getJson(path: string, params?: URLSearchParams): Promise<unknown> {
    const hosts = await getServers();
    const failures: string[] = [];
    const qs = params?.toString();

    for (const host of hosts) {
      const url = `https://${host}${path}${qs ? `?${qs}` : ""}`;
      let res: Response;
      try {
        res = await deps.fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        failures.push(`${host}: ${err instanceof Error ? err.message : "network error"}`);
        continue;
      }
      // A 4xx other than rate limiting means our request is wrong; another server won't help.
      if (res.status >= 400 && res.status < 500 && res.status !== 429)
        throw new RadioBrowserError("bad-request", `Radio Browser rejected ${path} (${res.status})`, res.status);
      if (!res.ok) {
        failures.push(`${host}: HTTP ${res.status}`);
        continue;
      }
      try {
        const body: unknown = await res.json();
        prefer(host);
        return body;
      } catch {
        failures.push(`${host}: invalid JSON`);
      }
    }

    cached = null; // rediscover next time; the server list may have changed
    throw new RadioBrowserError("unreachable", `All Radio Browser servers failed: ${failures.join("; ")}`);
  }

  return { getJson, getServers };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The app-wide client. Tests build their own with fake dependencies. */
export const radioBrowser = createRadioBrowserClient({
  resolveSrv,
  fetch: (...args) => fetch(...args),
  now: Date.now,
  random: Math.random,
});
