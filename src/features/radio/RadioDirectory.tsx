"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import type { Playability } from "./compatibility";
import { playStation, stationPlayability, stationSource } from "./playback";
import { StationBadge } from "./StationBadge";
import type { Station, StationPage } from "./types";

type Scope = "IN" | "world";
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };
/** Results tagged with the search they belong to; if the tag is stale, we're loading. */
type Results = { key: string; stations: Station[]; hasMore: boolean; error: string | null };

const PAGE_SIZE = 24;

/**
 * Minimal station list for Milestone 3: search, India/worldwide, play.
 * Language and genre filters, favourites and the tuner arrive in later milestones.
 */
export function RadioDirectory() {
  const [scope, setScope] = useState<Scope>("IN");
  const [text, setText] = useState("");
  const [query, setQuery] = useState(""); // debounced copy of `text`
  const [attempt, setAttempt] = useState(0); // bump to retry the first page
  const [results, setResults] = useState<Results | null>(null);
  // "Show more" request state, tagged like results so it resets with a new search.
  const [more, setMore] = useState<{ key: string; load: Load }>({ key: "", load: { status: "ready" } });

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const key = `${scope}|${query}|${attempt}`;

  // First page whenever the search or scope changes. Older requests are cancelled.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchPage(scope, query, 0, ctrl.signal)
      .then((page) => setResults({ key, stations: page.stations, hasMore: page.hasMore, error: null }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setResults({ key, stations: [], hasMore: false, error: errorMessage(err) });
      });
    return () => ctrl.abort();
  }, [key, scope, query]);

  const current = results?.key === key ? results : null;
  const stations = current?.stations ?? [];
  const hasMore = current?.hasMore ?? false;
  const load: Load = !current
    ? { status: "loading" }
    : current.error
      ? { status: "error", message: current.error }
      : more.key === key
        ? more.load
        : { status: "ready" };

  async function loadMore() {
    setMore({ key, load: { status: "loading" } });
    try {
      const page = await fetchPage(scope, query, stations.length, undefined);
      setResults((prev) =>
        prev && prev.key === key
          ? { ...prev, stations: dedupe([...prev.stations, ...page.stations]), hasMore: page.hasMore }
          : prev,
      );
      setMore({ key, load: { status: "ready" } });
    } catch (err) {
      setMore({ key, load: { status: "error", message: errorMessage(err) } });
    }
  }

  const firstLoad = !current;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-semibold">Search stations</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={80}
            placeholder="Try Mirchi, Vividh Bharati or retro"
            className="w-full rounded-xl border-2 border-ink/25 bg-panel px-4 py-2.5 placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
          />
        </label>
        <fieldset className="flex rounded-xl border-2 border-ink/25 bg-panel p-1">
          <legend className="sr-only">Where</legend>
          {(["IN", "world"] as const).map((s) => (
            <label
              key={s}
              className={`cursor-pointer rounded-lg px-4 py-1.5 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-tv ${
                scope === s ? "bg-ink text-panel" : "hover:bg-ink/10"
              }`}
            >
              <input
                type="radio"
                name="scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
                className="sr-only"
              />
              {s === "IN" ? "India" : "Worldwide"}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="mt-6" aria-busy={load.status === "loading"}>
        {firstLoad && <p className="py-10 text-center text-ink-soft">Tuning the dial…</p>}

        {load.status === "ready" && stations.length === 0 && (
          <p className="py-10 text-center text-ink-soft">
            No stations match &ldquo;{query}&rdquo;.{" "}
            {scope === "IN" ? "Try a shorter name, or search Worldwide." : "Try a shorter name."}
          </p>
        )}

        {!firstLoad && stations.length > 0 && (
          <ul className="divide-y-2 divide-ink/10 rounded-2xl border-2 border-ink/15 bg-panel">
            {stations.map((s) => (
              <StationRow key={s.id} station={s} />
            ))}
          </ul>
        )}

        {load.status === "error" && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-3 text-panel">
            <span className="flex-1">{load.message}</span>
            <button
              type="button"
              onClick={() => (current?.error ? setAttempt((a) => a + 1) : loadMore())}
              className="rounded-full bg-radio px-4 py-1.5 font-semibold text-ink"
            >
              Try again
            </button>
          </div>
        )}

        {hasMore && load.status !== "error" && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={load.status === "loading"}
              className="rounded-full border-2 border-ink px-6 py-2.5 font-semibold hover:bg-ink/10 disabled:opacity-50"
            >
              {load.status === "loading" ? "Loading…" : "Show more stations"}
            </button>
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-ink-soft">
        Station directory from{" "}
        <a href="https://www.radio-browser.info/" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          radio-browser.info
        </a>
        . Streams play directly from each broadcaster; XPLOR9 never copies or relays them.
      </p>
    </div>
  );
}

const PLAYABILITY_NOTE: Record<Exclude<Playability, "playable">, string> = {
  unverified: "Unknown stream format, may not play",
  unsupported: "This browser can't play this stream format",
  unavailable: "Stream unavailable",
};

function StationRow({ station }: { station: Station }) {
  const player = usePlayback();
  const playability = stationPlayability(station);
  const isCurrent = player.source?.id === stationSource(station).id;
  const active = isCurrent && (player.status === "loading" || player.status === "playing" || player.status === "buffering");
  const canTry = playability === "playable" || playability === "unverified";

  const meta = [
    station.country,
    station.languages
      .slice(0, 2)
      .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
      .join(", "),
    station.bitrate ? `${station.bitrate} kbps` : null,
  ].filter(Boolean);

  return (
    <li className={`flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 ${isCurrent ? "bg-radio/25" : ""}`}>
      <StationBadge name={station.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{station.name}</p>
        <p className="truncate text-sm text-ink-soft">{meta.join(" / ")}</p>
        {playability !== "playable" && (
          <p className="text-sm font-semibold text-music">{PLAYABILITY_NOTE[playability]}</p>
        )}
        {isCurrent && player.status === "error" && (
          <p className="text-sm font-semibold text-music">{player.error?.message}</p>
        )}
      </div>
      <button
        type="button"
        disabled={!canTry}
        onClick={() => (isCurrent ? getPlaybackEngine().toggle() : playStation(station))}
        aria-label={`${active ? "Pause" : "Play"} ${station.name}`}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-panel hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/40"
      >
        <Icon name={active ? "pause" : "play"} className="h-6 w-6" />
      </button>
    </li>
  );
}

async function fetchPage(scope: Scope, q: string, offset: number, signal: AbortSignal | undefined): Promise<StationPage> {
  const params = new URLSearchParams({ order: "popular", offset: String(offset), limit: String(PAGE_SIZE) });
  if (scope === "IN") params.set("country", "IN");
  if (q) params.set("q", q);
  let res: Response;
  try {
    res = await fetch(`/api/radio/stations?${params}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(navigator.onLine ? "Couldn't reach XPLOR9. Check your connection and try again." : "You're offline. Reconnect, then try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? "Something went wrong loading stations.");
  }
  return body as StationPage;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong loading stations.";
}

function dedupe(list: Station[]) {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
