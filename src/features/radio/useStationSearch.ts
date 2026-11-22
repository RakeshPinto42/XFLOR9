"use client";

import { useEffect, useState } from "react";
import type { Station, StationPage } from "./types";

export interface SearchInput {
  scope: "IN" | "world";
  q: string;
  language: string | null;
  tag: string | null;
}

export type SearchStatus = "loading" | "ready" | "error";

const PAGE_SIZE = 30;

/** Results tagged with the search they belong to; a stale tag means a new search is loading. */
type Results = { key: string; stations: Station[]; hasMore: boolean; error: string | null };
type More = { key: string; status: "idle" | "loading" | "error"; error: string | null };

/**
 * Fetches station pages for the current filters. Older requests are cancelled when filters
 * change, so results from a previous search can never overwrite a newer one.
 */
export function useStationSearch(input: SearchInput, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [more, setMore] = useState<More>({ key: "", status: "idle", error: null });
  const { scope, q, language, tag } = input;
  const key = JSON.stringify([scope, q, language, tag, attempt]);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    fetchStationPage({ scope, q, language, tag }, 0, ctrl.signal)
      .then((page) => setResults({ key, stations: page.stations, hasMore: page.hasMore, error: null }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setResults({ key, stations: [], hasMore: false, error: messageOf(err) });
      });
    return () => ctrl.abort();
  }, [key, enabled, scope, q, language, tag]);

  const current = results?.key === key ? results : null;
  const moreNow = more.key === key ? more : { status: "idle" as const, error: null };

  async function loadMore() {
    if (!current) return;
    setMore({ key, status: "loading", error: null });
    try {
      const page = await fetchStationPage({ scope, q, language, tag }, current.stations.length, undefined);
      setResults((prev) =>
        prev && prev.key === key
          ? { ...prev, stations: dedupe([...prev.stations, ...page.stations]), hasMore: page.hasMore }
          : prev,
      );
      setMore({ key, status: "idle", error: null });
    } catch (err) {
      setMore({ key, status: "error", error: messageOf(err) });
    }
  }

  const status: SearchStatus = !current ? "loading" : current.error ? "error" : "ready";
  return {
    status,
    stations: current?.stations ?? [],
    hasMore: current?.hasMore ?? false,
    error: current?.error ?? null,
    retry: () => setAttempt((a) => a + 1),
    loadMore,
    moreStatus: moreNow.status,
    moreError: moreNow.error,
  };
}

async function fetchStationPage(input: SearchInput, offset: number, signal: AbortSignal | undefined): Promise<StationPage> {
  const params = new URLSearchParams({ order: "popular", offset: String(offset), limit: String(PAGE_SIZE) });
  if (input.scope === "IN") params.set("country", "IN");
  if (input.q) params.set("q", input.q);
  if (input.language) params.set("language", input.language);
  if (input.tag) params.set("tag", input.tag);
  return getJson<StationPage>(`/api/radio/stations?${params}`, signal);
}

/** Shared fetch helper for the radio API: turns failures into readable messages. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(
      navigator.onLine
        ? "Couldn't reach XPLOR9. Check your connection and try again."
        : "You're offline. Reconnect, then try again.",
    );
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? "Something went wrong loading stations.");
  }
  return body as T;
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong loading stations.";
}

function dedupe(list: Station[]) {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
