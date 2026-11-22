"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePlayback } from "@/lib/playback/browser";
import { useLocalStore } from "@/lib/storage/store";
import { refreshSnapshots } from "./library";
import { RadioFilters } from "./RadioFilters";
import { clearRecents, favourites, radioPrefs, recents, type RadioPrefs, type RadioView } from "./radioStores";
import { StationList } from "./StationList";
import { Tuner } from "./tuner/Tuner";
import type { Station } from "./types";
import { getJson, useStationSearch } from "./useStationSearch";

const VIEWS: { id: RadioView; label: string; short?: string }[] = [
  { id: "stations", label: "Stations" },
  { id: "favourites", label: "Favourites" },
  { id: "recent", label: "Recently played", short: "Recent" },
];

let favouritesRefreshed = false; // once per visit is enough

/** The radio page: tuner on top, then views (stations / favourites / recent) with filters. */
export function RadioExperience() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const prefs = useLocalStore(radioPrefs);
  const favs = useLocalStore(favourites);
  const recent = useLocalStore(recents);
  const player = usePlayback();

  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const search = useStationSearch(
    { scope: prefs.scope, q, language: prefs.language, tag: prefs.tag },
    hydrated && prefs.view === "stations",
  );

  // Keep saved favourites fresh (stream URLs change; stations get removed).
  const [missing, setMissing] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!hydrated || prefs.view !== "favourites" || favs.length === 0 || favouritesRefreshed) return;
    favouritesRefreshed = true;
    const ids = favs.map((f) => f.id);
    const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50));
    Promise.all(chunks.map((c) => getJson<{ stations: Station[] }>(`/api/radio/stations/lookup?ids=${c.join(",")}`)))
      .then((results) => {
        const { stations, missing } = refreshSnapshots(favourites.get(), results.flatMap((r) => r.stations));
        favourites.set(stations);
        setMissing(missing);
      })
      .catch(() => {
        favouritesRefreshed = false; // keep showing saved copies; try again next time
      });
  }, [hydrated, prefs.view, favs]);

  // "Played 5 minutes ago" labels. The clock is read in the browser only (never at build time).
  const now = useSyncExternalStore(subscribeClock, getClock, () => 0);

  const list: Station[] =
    prefs.view === "stations" ? search.stations : prefs.view === "favourites" ? favs : recent.map((r) => r.station);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const playingId = player.source?.id.startsWith("radio:") ? player.source.id.slice(6) : null;
  const indexOf = (id: string | null) => (id ? list.findIndex((s) => s.id === id) : -1);
  const selectedIndex = Math.max(0, indexOf(selectedId) >= 0 ? indexOf(selectedId) : indexOf(playingId));

  const set = (patch: Partial<RadioPrefs>) => radioPrefs.set((p) => ({ ...p, ...patch }));
  const band =
    prefs.view === "stations"
      ? [prefs.scope === "IN" ? "INDIA" : "WORLD", prefs.language, prefs.tag].filter(Boolean).join(" ").toUpperCase()
      : prefs.view === "favourites"
        ? "FAVOURITES"
        : "RECENT";
  const listLoading = prefs.view === "stations" && (search.status === "loading" || !hydrated);

  return (
    <div className="space-y-8">
      <div>
        <Tuner
          stations={list}
          selectedIndex={selectedIndex}
          onSelect={(i) => list[i] && setSelectedId(list[i].id)}
          band={band}
          loading={listLoading}
        />
        <p className="mt-3 text-sm text-ink-soft">
          The dial has one position per station in the list below. Radio Browser doesn&apos;t publish FM
          frequencies, so XPLOR9 doesn&apos;t invent them.
        </p>
      </div>

      <div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => {
            const n = v.id === "favourites" ? favs.length : v.id === "recent" ? recent.length : null;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={prefs.view === v.id}
                onClick={() => set({ view: v.id })}
                className={`rounded-full px-4 py-2 font-semibold ${
                  prefs.view === v.id ? "bg-ink text-panel" : "bg-panel hover:bg-ink/10"
                }`}
              >
                {v.short ? (
                  <>
                    <span className="sm:hidden">{v.short}</span>
                    <span className="hidden sm:inline">{v.label}</span>
                  </>
                ) : (
                  v.label
                )}
                {hydrated && n !== null && n > 0 && <span className="ml-1.5 opacity-75">{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {prefs.view === "stations" && (
            <>
              <RadioFilters
                text={text}
                onText={setText}
                scope={prefs.scope}
                onScope={(scope) => set({ scope })}
                language={prefs.language}
                onLanguage={(language) => set({ language })}
                tag={prefs.tag}
                onTag={(tag) => set({ tag })}
              />
              <div className="mt-6" aria-busy={search.status === "loading"}>
                <StationsView
                  search={search}
                  prefs={prefs}
                  q={q}
                  selectedId={list[selectedIndex]?.id ?? null}
                  onSelect={setSelectedId}
                  onPatch={set}
                  onClearText={() => setText("")}
                />
              </div>
            </>
          )}

          {prefs.view === "favourites" &&
            (favs.length === 0 ? (
              <Empty>No favourites yet. Tap the heart on any station to keep it here.</Empty>
            ) : (
              <StationList stations={favs} selectedId={list[selectedIndex]?.id ?? null} onSelect={setSelectedId} missing={missing} />
            ))}

          {prefs.view === "recent" &&
            (recent.length === 0 ? (
              <Empty>Stations you play will appear here, newest first.</Empty>
            ) : (
              <>
                <StationList
                  stations={recent.map((r) => r.station)}
                  selectedId={list[selectedIndex]?.id ?? null}
                  onSelect={setSelectedId}
                  notes={new Map(recent.map((r) => [r.station.id, `Played ${relativeTime(r.playedAt, now)}`]))}
                />
                <button type="button" onClick={clearRecents} className="mt-4 text-sm font-semibold underline underline-offset-4">
                  Clear listening history
                </button>
              </>
            ))}
        </div>
      </div>

      <p className="text-sm text-ink-soft">
        Station directory from{" "}
        <a href="https://www.radio-browser.info/" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          radio-browser.info
        </a>
        . Streams play directly from each broadcaster; XPLOR9 never copies or relays them. Favourites and history stay in
        this browser.
      </p>
    </div>
  );
}

function StationsView({
  search,
  prefs,
  q,
  selectedId,
  onSelect,
  onPatch,
  onClearText,
}: {
  search: ReturnType<typeof useStationSearch>;
  prefs: RadioPrefs;
  q: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPatch: (p: Partial<RadioPrefs>) => void;
  onClearText: () => void;
}) {
  if (search.status === "loading") return <p className="py-10 text-center text-ink-soft">Tuning the dial…</p>;

  if (search.status === "error")
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-3 text-panel">
        <span className="flex-1">{search.error}</span>
        <button type="button" onClick={search.retry} className="rounded-full bg-radio px-4 py-1.5 font-semibold text-ink">
          Try again
        </button>
      </div>
    );

  if (search.stations.length === 0) {
    const what = [prefs.language && cap(prefs.language), "stations"].filter(Boolean).join(" ");
    const where = prefs.scope === "IN" ? " in India" : "";
    const tagged = prefs.tag ? ` tagged ${cap(prefs.tag)}` : "";
    const named = q ? ` matching “${q}”` : "";
    return (
      <div className="rounded-2xl border-2 border-dashed border-ink/25 px-5 py-8 text-center">
        <p className="font-semibold">
          No {what}
          {tagged}
          {named}
          {where}.
        </p>
        {prefs.tag && prefs.scope === "IN" && (
          <p className="mt-1 text-sm text-ink-soft">Most Indian stations don&apos;t list a genre, so genre filters find fewer here.</p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {prefs.tag && <Action onClick={() => onPatch({ tag: null })}>Remove genre</Action>}
          {prefs.language && <Action onClick={() => onPatch({ language: null })}>Remove language</Action>}
          {q && <Action onClick={onClearText}>Clear search</Action>}
          {prefs.scope === "IN" && <Action onClick={() => onPatch({ scope: "world" })}>Search worldwide</Action>}
        </div>
      </div>
    );
  }

  return (
    <>
      <StationList stations={search.stations} selectedId={selectedId} onSelect={onSelect} />
      {search.moreError && (
        <p role="alert" className="mt-4 text-center font-semibold text-music">
          {search.moreError}
        </p>
      )}
      {search.hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={search.loadMore}
            disabled={search.moreStatus === "loading"}
            className="rounded-full border-2 border-ink px-6 py-2.5 font-semibold hover:bg-ink/10 disabled:opacity-50"
          >
            {search.moreStatus === "loading" ? "Loading…" : search.moreError ? "Try again" : "Show more stations"}
          </button>
        </div>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border-2 border-dashed border-ink/25 px-5 py-10 text-center text-ink-soft">{children}</p>;
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border-2 border-ink px-4 py-1.5 text-sm font-semibold hover:bg-ink/10">
      {children}
    </button>
  );
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeTime(then: number, now: number) {
  const mins = Math.round((then - now) / 60_000);
  if (mins > -1) return "just now";
  if (mins > -60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours > -24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function noopSubscribe() {
  return () => {};
}

/** A minute-resolution clock that components can subscribe to. */
let clock = 0;
function getClock() {
  if (!clock) clock = Date.now();
  return clock;
}
function subscribeClock(onChange: () => void) {
  const t = setInterval(() => {
    clock = Date.now();
    onChange();
  }, 60_000);
  return () => clearInterval(t);
}
