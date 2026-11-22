"use client";

import { useEffect, useState } from "react";
import type { Facet } from "./types";
import { getJson } from "./useStationSearch";

/**
 * Quick picks were chosen from live data (Nov 2026, 605 working https Indian stations):
 * languages by station count; genres that exist as real tags. Note the data's own
 * spelling: Bengali stations are mostly tagged "bangla".
 */
const QUICK_LANGUAGES = [
  ["hindi", "Hindi"],
  ["english", "English"],
  ["kannada", "Kannada"],
  ["tamil", "Tamil"],
  ["malayalam", "Malayalam"],
  ["telugu", "Telugu"],
  ["punjabi", "Punjabi"],
  ["bangla", "Bangla"],
] as const;

const QUICK_GENRES = [
  ["bollywood", "Bollywood"],
  ["devotional", "Devotional"],
  ["news", "News"],
  ["classical", "Classical"],
  ["retro", "Retro"],
  ["jazz", "Jazz"],
  ["pop", "Pop"],
] as const;

interface Props {
  text: string;
  onText: (v: string) => void;
  scope: "IN" | "world";
  onScope: (v: "IN" | "world") => void;
  language: string | null;
  onLanguage: (v: string | null) => void;
  tag: string | null;
  onTag: (v: string | null) => void;
}

export function RadioFilters(p: Props) {
  const hasFilters = !!(p.text || p.language || p.tag);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-semibold">Search by station name</span>
          <input
            type="search"
            value={p.text}
            onChange={(e) => p.onText(e.target.value)}
            maxLength={80}
            placeholder="Try Mirchi, Vividh Bharati or retro"
            className="w-full rounded-xl border-2 border-ink/25 bg-panel px-4 py-2.5 placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
          />
        </label>
        <fieldset className="flex rounded-xl border-2 border-ink/25 bg-panel p-1">
          <legend className="sr-only">Country</legend>
          {(["IN", "world"] as const).map((s) => (
            <label
              key={s}
              className={`cursor-pointer rounded-lg px-4 py-1.5 font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-tv has-[:focus-visible]:outline ${
                p.scope === s ? "bg-ink text-panel" : "hover:bg-ink/10"
              }`}
            >
              <input type="radio" name="scope" value={s} checked={p.scope === s} onChange={() => p.onScope(s)} className="sr-only" />
              {s === "IN" ? "India" : "Worldwide"}
            </label>
          ))}
        </fieldset>
      </div>

      <FilterRow
        label="Language"
        kind="languages"
        quick={QUICK_LANGUAGES}
        value={p.language}
        onChange={p.onLanguage}
      />
      <FilterRow label="Genre" kind="tags" quick={QUICK_GENRES} value={p.tag} onChange={p.onTag} />

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            p.onText("");
            p.onLanguage(null);
            p.onTag(null);
          }}
          className="text-sm font-semibold underline underline-offset-4"
        >
          Clear search and filters
        </button>
      )}
    </div>
  );
}

function FilterRow({
  label,
  kind,
  quick,
  value,
  onChange,
}: {
  label: string;
  kind: "languages" | "tags";
  quick: readonly (readonly [string, string])[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const facets = useFacets(kind);
  const quickValues = new Set(quick.map(([v]) => v));
  const others = (facets ?? []).filter((f) => !quickValues.has(f.value));
  // A remembered value that isn't a quick pick must still show as selected.
  const valueInOthers = value && !quickValues.has(value);

  return (
    // On phones each row is one horizontally scrolling line so the station list stays close.
    <div role="group" aria-label={label} className="sm:flex sm:items-center sm:gap-2">
      <span className="mb-1.5 block text-sm font-semibold sm:mb-0 sm:w-20 sm:shrink-0">{label}</span>
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
      {quick.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)}
          className={`shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold ${
            value === v ? "border-ink bg-ink text-panel" : "border-ink/25 bg-panel hover:border-ink"
          }`}
        >
          {text}
        </button>
      ))}
      {(others.length > 0 || valueInOthers) && (
        <select
          aria-label={`More ${label.toLowerCase()}s`}
          value={valueInOthers ? value! : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={`max-w-[11rem] shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold ${
            valueInOthers ? "border-ink bg-ink text-panel" : "border-ink/25 bg-panel"
          }`}
        >
          <option value="">More…</option>
          {valueInOthers && !others.some((f) => f.value === value) && <option value={value!}>{value}</option>}
          {others.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}
      </div>
    </div>
  );
}

const facetCache = new Map<string, Promise<Facet[]>>();

/** Loads the full language/genre lists once per visit. Quick picks work even if this fails. */
function useFacets(kind: "languages" | "tags"): Facet[] | null {
  const [facets, setFacets] = useState<Facet[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!facetCache.has(kind)) {
      facetCache.set(
        kind,
        getJson<{ facets: Facet[] }>(`/api/radio/facets/${kind}`).then((r) => r.facets),
      );
    }
    facetCache
      .get(kind)!
      .then((f) => alive && setFacets(f))
      .catch(() => facetCache.delete(kind)); // retry on next mount; chips still work
    return () => {
      alive = false;
    };
  }, [kind]);
  return facets;
}
