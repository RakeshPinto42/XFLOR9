"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";
import type { Playability } from "./compatibility";
import { refreshSnapshots } from "./library";
import { playStation, stationPlayability, stationSource } from "./playback";
import { EMPTY_PRESETS, clearPreset, parsePresets, presetSlot, sortStations, storePreset, type SortKey } from "./presets";
import { clearRecents, favourites, radioPrefs, recents, toggleFavouriteStation, type RadioPrefs, type RadioView } from "./radioStores";
import { Tuner } from "./tuner/Tuner";
import type { Facet, Station } from "./types";
import { getJson, useStationSearch } from "./useStationSearch";
import "./radio.css";

/**
 * Radio (D2): "XPLOR9 Tuner", desktop radio software. A browse tree (stations, favourites,
 * recently played, languages, genres), a hi-fi tuner deck (dial, display, knob, transport,
 * volume and six memory presets), a sortable station table and a status bar.
 *
 * The dial has one position per station in the list being viewed: the station directory doesn't
 * publish FM frequencies, so none are invented. Streams play straight from each broadcaster.
 */

/** Quick picks chosen from live data (Nov 2026): languages by station count, genres that exist as tags. */
const LANGUAGES = [
  ["hindi", "Hindi"],
  ["english", "English"],
  ["kannada", "Kannada"],
  ["tamil", "Tamil"],
  ["malayalam", "Malayalam"],
  ["telugu", "Telugu"],
  ["punjabi", "Punjabi"],
  ["bangla", "Bangla"],
] as const;
const GENRES = [
  ["bollywood", "Bollywood"],
  ["devotional", "Devotional"],
  ["news", "News"],
  ["classical", "Classical"],
  ["retro", "Retro"],
  ["jazz", "Jazz"],
  ["pop", "Pop"],
] as const;

const NOTE: Record<Exclude<Playability, "playable">, string> = {
  unverified: "Unknown stream format; it may not play",
  unsupported: "This browser can't play this stream format",
  unavailable: "This station's stream isn't available right now",
};

const presetsStore = createLocalStore(STORAGE_KEYS.radioPresets, EMPTY_PRESETS, parsePresets);
let favouritesRefreshed = false; // once per visit is enough

export function RadioExperience() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const prefs = useLocalStore(radioPrefs);
  const favs = useLocalStore(favourites);
  const recent = useLocalStore(recents);
  const player = usePlayback();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "rank", desc: false });
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const search = useStationSearch({ scope: prefs.scope, q, language: prefs.language, tag: prefs.tag }, hydrated && prefs.view === "stations");

  // Keep saved favourites fresh (stream addresses change; stations get removed).
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

  const now = useSyncExternalStore(subscribeClock, getClock, () => 0);

  const base: Station[] = prefs.view === "stations" ? search.stations : prefs.view === "favourites" ? favs : recent.map((r) => r.station);
  const list = sortStations(base, sort.key, sort.desc);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const playingId = player.source?.id.startsWith("radio:") ? player.source.id.slice(6) : null;
  const indexOf = (id: string | null) => (id ? list.findIndex((s) => s.id === id) : -1);
  const selectedIndex = Math.max(0, indexOf(selectedId) >= 0 ? indexOf(selectedId) : indexOf(playingId));
  const selected = list[selectedIndex];

  const set = (patch: Partial<RadioPrefs>) => radioPrefs.set((p) => ({ ...p, ...patch }));
  const browse = (view: RadioView, patch: Partial<RadioPrefs> = {}) => {
    set({ view, ...patch });
    setSort({ key: "rank", desc: false });
  };
  const label = (v: string | null, quick: readonly (readonly [string, string])[]) => (v ? (quick.find(([x]) => x === v)?.[1] ?? cap(v)) : null);
  const band =
    prefs.view === "stations"
      ? [prefs.scope === "IN" ? "India" : "Worldwide", label(prefs.language, LANGUAGES), label(prefs.tag, GENRES)].filter(Boolean).join(" · ")
      : prefs.view === "favourites"
        ? "Favourites"
        : "Recently played";
  const listLoading = prefs.view === "stations" && (search.status === "loading" || !hydrated);

  return (
    <div className="rt" data-testid="radio-app">
      <h1 className="sr-only">Radio</h1>
      <nav className="rt-tree" aria-label="Browse stations">
        <p className="xp-sidebar-heading">Library</p>
        <TreeItem current={prefs.view === "stations" && !prefs.language && !prefs.tag} onClick={() => browse("stations", { language: null, tag: null })}>
          All stations
        </TreeItem>
        <TreeItem current={prefs.view === "favourites"} onClick={() => browse("favourites")} count={hydrated ? favs.length : 0}>
          Favourites
        </TreeItem>
        <TreeItem current={prefs.view === "recent"} onClick={() => browse("recent")} count={hydrated ? recent.length : 0}>
          Recently played
        </TreeItem>
        <p className="xp-sidebar-heading">Languages</p>
        {LANGUAGES.map(([v, l]) => (
          <TreeItem key={v} current={prefs.view === "stations" && prefs.language === v} onClick={() => browse("stations", { language: prefs.language === v ? null : v })}>
            {l}
          </TreeItem>
        ))}
        <p className="xp-sidebar-heading">Genres</p>
        {GENRES.map(([v, l]) => (
          <TreeItem key={v} current={prefs.view === "stations" && prefs.tag === v} onClick={() => browse("stations", { tag: prefs.tag === v ? null : v })}>
            {l}
          </TreeItem>
        ))}
      </nav>

      <div className="rt-main">
        <div className="xp-toolbar rt-toolbar" role="search">
          <label className="sr-only" htmlFor="rt-search">
            Search by station name
          </label>
          <input
            id="rt-search"
            type="search"
            className="xp-input rt-search"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (prefs.view !== "stations") browse("stations");
            }}
            maxLength={80}
            placeholder="Search stations: Mirchi, Vividh Bharati, retro…"
          />
          <div role="radiogroup" aria-label="Where" className="rt-segment">
            {(["IN", "world"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={prefs.scope === s} onClick={() => browse("stations", { scope: s })}>
                {s === "IN" ? "India" : "Worldwide"}
              </button>
            ))}
          </div>
          <FacetSelect kind="languages" label="Language" quick={LANGUAGES} value={prefs.language} onChange={(language) => browse("stations", { language })} />
          <FacetSelect kind="tags" label="Genre" quick={GENRES} value={prefs.tag} onChange={(tag) => browse("stations", { tag })} />
          {(text || prefs.language || prefs.tag) && (
            <button
              type="button"
              className="xp-button"
              onClick={() => {
                setText("");
                set({ language: null, tag: null });
              }}
            >
              Clear search and filters
            </button>
          )}
        </div>

        <div className="rt-body">
          <Tuner stations={list} selectedIndex={selectedIndex} onSelect={(i) => list[i] && setSelectedId(list[i].id)} band={band} loading={listLoading}>
            <VolumeKnob />
          </Tuner>
          <Presets selected={selected} />

          <section className="rt-list" aria-label="Stations" aria-busy={listLoading}>
            <div className="rt-list-head">
              <h2>{band}</h2>
              {prefs.view === "recent" && recent.length > 0 && (
                <button type="button" className="xp-button" onClick={clearRecents}>
                  Clear listening history
                </button>
              )}
            </div>
            <StationsBody
              view={prefs.view}
              search={search}
              prefs={prefs}
              q={q}
              list={list}
              hydrated={hydrated}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              onPatch={set}
              onClearText={() => setText("")}
              sort={sort}
              onSort={(key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "bitrate" }))}
              missing={missing}
              notes={prefs.view === "recent" ? new Map(recent.map((r) => [r.station.id, `Played ${relativeTime(r.playedAt, now)}`])) : undefined}
            />
          </section>
        </div>

        <div className="xp-statusbar rt-status" aria-live="polite">
          <span className="truncate">
            {player.source?.kind === "radio"
              ? `${player.status === "playing" ? "On air" : player.status === "paused" ? "Paused" : player.status === "error" ? "No reception" : "Tuning"}: ${player.source.title}`
              : "Ready"}
          </span>
          <span className="shrink-0">
            Station directory:{" "}
            <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">
              radio-browser.info
            </a>
            . Streams play straight from each broadcaster.
          </span>
        </div>
      </div>
    </div>
  );
}

function TreeItem({ current, onClick, count, children }: { current: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button type="button" className="rt-tree-item" aria-current={current ? "true" : undefined} onClick={onClick}>
      <span className="truncate">{children}</span>
      {count ? <span className="rt-count">{count}</span> : null}
    </button>
  );
}

/** The deck's volume: the shared player's own volume (saved; the overall volume is in the tray). */
function VolumeKnob() {
  const player = usePlayback();
  const v = Math.round((player.muted ? 0 : player.volume) * 100);
  if (!player.volumeControllable) return null;
  return (
    <label className="rt-volume">
      <span>Volume</span>
      <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => getPlaybackEngine().setVolume(Number(e.target.value) / 100)} aria-valuetext={`${v}%`} />
    </label>
  );
}

/** Six memory buttons. Press to tune; press Store, then a button, to keep the selected station there. */
function Presets({ selected }: { selected: Station | undefined }) {
  const presets = useLocalStore(presetsStore);
  const player = usePlayback();
  const [storing, setStoring] = useState(false);
  const playingId = player.source?.id.startsWith("radio:") ? player.source.id.slice(6) : undefined;
  const lit = presetSlot(presets, playingId);
  return (
    <div className="rt-presets" role="group" aria-label="Memory presets">
      <span className="rt-presets-label">Memory</span>
      {presets.map((s, i) => {
        const label = storing
          ? selected
            ? s?.id === selected.id
              ? `Clear preset ${i + 1}`
              : `Store ${selected.name} in preset ${i + 1}`
            : `Preset ${i + 1}`
          : s
            ? `Preset ${i + 1}: ${s.name}`
            : `Preset ${i + 1}: empty${selected ? `. Press to store ${selected.name}` : ""}`;
        return (
          <button
            key={i}
            type="button"
            className="rt-preset"
            data-lit={lit === i || undefined}
            data-storing={storing || undefined}
            aria-label={label}
            title={label}
            onClick={() => {
              if (storing || !s) {
                if (!selected) return;
                presetsStore.set((p) => (s?.id === selected.id && storing ? clearPreset(p, i) : storePreset(p, i, selected)));
                setStoring(false);
                return;
              }
              const p = stationPlayability(s);
              if (p === "playable" || p === "unverified") playStation(s);
            }}
          >
            <span className="rt-preset-n">{i + 1}</span>
            <span className="rt-preset-name">{s?.name ?? "Empty"}</span>
          </button>
        );
      })}
      <button type="button" className="rt-preset rt-preset--store" aria-pressed={storing} disabled={!selected} onClick={() => setStoring((x) => !x)}>
        Store
      </button>
    </div>
  );
}

function StationsBody(p: {
  view: RadioView;
  search: ReturnType<typeof useStationSearch>;
  prefs: RadioPrefs;
  q: string;
  list: Station[];
  hydrated: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPatch: (patch: Partial<RadioPrefs>) => void;
  onClearText: () => void;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  missing: Set<string>;
  notes?: Map<string, string>;
}) {
  const { view, search, prefs, q } = p;
  if (view === "stations" && (search.status === "loading" || !p.hydrated)) return <p className="rt-empty">Scanning the band…</p>;
  if (view === "stations" && search.status === "error")
    return (
      <div role="alert" className="rt-alert">
        <span>{search.error}</span>
        <button type="button" onClick={search.retry} className="xp-button">
          Try again
        </button>
      </div>
    );
  if (p.list.length === 0) {
    if (view === "favourites") return <p className="rt-empty">No favourites yet. Press the heart next to any station to keep it here.</p>;
    if (view === "recent") return <p className="rt-empty">Stations you play appear here, newest first.</p>;
    const what = [prefs.language && cap(prefs.language), "stations"].filter(Boolean).join(" ");
    return (
      <div className="rt-empty">
        <p className="font-semibold">
          No {what}
          {prefs.tag ? ` tagged ${cap(prefs.tag)}` : ""}
          {q ? ` matching “${q}”` : ""}
          {prefs.scope === "IN" ? " in India" : ""}.
        </p>
        {prefs.tag && prefs.scope === "IN" && <p>Most Indian stations don&apos;t list a genre, so genre filters find fewer here.</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {prefs.tag && (
            <button type="button" className="xp-button" onClick={() => p.onPatch({ tag: null })}>
              Remove genre
            </button>
          )}
          {prefs.language && (
            <button type="button" className="xp-button" onClick={() => p.onPatch({ language: null })}>
              Remove language
            </button>
          )}
          {q && (
            <button type="button" className="xp-button" onClick={p.onClearText}>
              Clear search
            </button>
          )}
          {prefs.scope === "IN" && (
            <button type="button" className="xp-button" onClick={() => p.onPatch({ scope: "world" })}>
              Search worldwide
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <>
      <StationTable stations={p.list} selectedId={p.selectedId} onSelect={p.onSelect} sort={p.sort} onSort={p.onSort} missing={p.missing} notes={p.notes} />
      {view === "stations" && search.moreError && (
        <p role="alert" className="rt-empty">
          {search.moreError}
        </p>
      )}
      {view === "stations" && search.hasMore && (
        <div className="rt-more">
          <button type="button" className="xp-button" onClick={search.loadMore} disabled={search.moreStatus === "loading"}>
            {search.moreStatus === "loading" ? "Loading…" : search.moreError ? "Try again" : "Show more stations"}
          </button>
        </div>
      )}
    </>
  );
}

function StationTable({
  stations,
  selectedId,
  onSelect,
  sort,
  onSort,
  missing,
  notes,
}: {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  missing: Set<string>;
  notes?: Map<string, string>;
}) {
  const player = usePlayback();
  const favs = useLocalStore(favourites);
  const favIds = new Set(favs.map((f) => f.id));
  const head = (key: SortKey, text: string, className?: string) => (
    <th scope="col" className={className} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => onSort(key)}>
        {text}
        {sort.key === key && <span aria-hidden>{sort.desc ? " ▾" : " ▴"}</span>}
      </button>
    </th>
  );
  return (
    <table className="rt-table">
      <thead>
        <tr>
          <th scope="col" className="rt-col-play">
            <span className="sr-only">Play</span>
          </th>
          {head("name", "Station")}
          {head("country", "Country", "rt-col-wide")}
          <th scope="col" className="rt-col-wide">
            Language
          </th>
          {head("bitrate", "Quality", "rt-col-q")}
          <th scope="col" className="rt-col-fav">
            <span className="sr-only">Favourite</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {stations.map((s) => {
          const playability = stationPlayability(s);
          const gone = missing.has(s.id);
          const canTry = !gone && (playability === "playable" || playability === "unverified");
          const isCurrent = player.source?.id === stationSource(s).id;
          const active = isCurrent && (player.status === "loading" || player.status === "playing" || player.status === "buffering");
          const isFav = favIds.has(s.id);
          const warning = gone ? "No longer listed in the station directory" : playability !== "playable" ? NOTE[playability] : isCurrent && player.status === "error" ? player.error?.message : null;
          const play = () => {
            onSelect(s.id);
            if (isCurrent) getPlaybackEngine().toggle();
            else if (canTry) playStation(s);
          };
          return (
            <tr key={s.id} aria-selected={s.id === selectedId} data-current={isCurrent || undefined} onClick={() => onSelect(s.id)} onDoubleClick={play}>
              <td className="rt-col-play">
                <button type="button" className="rt-play" disabled={!canTry} onClick={(e) => (e.stopPropagation(), play())} aria-label={`${active ? "Pause" : "Play"} ${s.name}`}>
                  <Icon name={active ? "pause" : "play"} className="h-4 w-4" />
                </button>
              </td>
              <td>
                <span className="rt-name">{s.name}</span>
                {notes?.get(s.id) && <span className="rt-sub">{notes.get(s.id)}</span>}
                {warning && <span className="rt-warn">{warning}</span>}
              </td>
              <td className="rt-col-wide">{s.country}</td>
              <td className="rt-col-wide">{s.languages.slice(0, 2).map(cap).join(", ")}</td>
              <td className="rt-col-q">{[s.bitrate ? `${s.bitrate} kbps` : null, s.codecLabel].filter(Boolean).join(" ") || "—"}</td>
              <td className="rt-col-fav">
                <button
                  type="button"
                  className="rt-heart"
                  onClick={(e) => (e.stopPropagation(), toggleFavouriteStation(s))}
                  aria-pressed={isFav}
                  aria-label={`${isFav ? "Remove" : "Add"} ${s.name} ${isFav ? "from" : "to"} favourites`}
                >
                  <Icon name={isFav ? "heart" : "heartOutline"} className="h-4 w-4" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Language or genre picker: the quick picks first, then every value the directory lists. */
function FacetSelect({ kind, label, quick, value, onChange }: { kind: "languages" | "tags"; label: string; quick: readonly (readonly [string, string])[]; value: string | null; onChange: (v: string | null) => void }) {
  const facets = useFacets(kind);
  const quickValues = new Set(quick.map(([v]) => v));
  const others = (facets ?? []).filter((f) => !quickValues.has(f.value));
  const known = quickValues.has(value ?? "") || others.some((f) => f.value === value);
  return (
    <select className="xp-input rt-select" aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Any {label.toLowerCase()}</option>
      {value && !known && <option value={value}>{cap(value)}</option>}
      <optgroup label="Popular">
        {quick.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </optgroup>
      {others.length > 0 && (
        <optgroup label="All">
          {others.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

const facetCache = new Map<string, Promise<Facet[]>>();
/** Loads the full language/genre lists once per visit. Quick picks work even if this fails. */
function useFacets(kind: "languages" | "tags"): Facet[] | null {
  const [facets, setFacets] = useState<Facet[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!facetCache.has(kind)) facetCache.set(kind, getJson<{ facets: Facet[] }>(`/api/radio/facets/${kind}`).then((r) => r.facets));
    facetCache
      .get(kind)!
      .then((f) => alive && setFacets(f))
      .catch(() => facetCache.delete(kind));
    return () => {
      alive = false;
    };
  }, [kind]);
  return facets;
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

/** A minute-resolution clock components can subscribe to. */
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
