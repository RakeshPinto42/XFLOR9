"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import type { EpubController, SearchExcerpt } from "./epubEngine";

type Group = { chapter: string; hits: { cfi: string; excerpt: SearchExcerpt }[] };
type State =
  | { kind: "idle" }
  | { kind: "searching"; query: string; progress: number; groups: Group[] }
  | { kind: "done"; query: string; groups: Group[] }
  | { kind: "error"; query: string; message: string };

const MAX_HITS = 500; // keeps the list responsive for very common words

/** In-book search. Results are grouped by chapter; choosing one jumps to that exact match. */
export function SearchPanel({
  controller,
  onPick,
  colors,
}: {
  controller: EpubController | null;
  onPick: (cfi: string) => void;
  colors: { text: string; muted: string; link: string };
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const run = useRef(0); // each search gets a number; older searches stop when it changes

  useEffect(() => () => void run.current++, []); // stop any running search on unmount

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!controller || q.length < 2) return;
    const mine = ++run.current;
    let groups: Group[] = [];
    let total = 0;
    setState({ kind: "searching", query: q, progress: 0, groups });
    try {
      for await (const ev of controller.search(q)) {
        if (mine !== run.current) return; // a newer search started; this loop's return() stops scanning
        if (ev.kind === "progress") setState({ kind: "searching", query: q, progress: ev.fraction, groups });
        else if (ev.kind === "results") {
          const room = MAX_HITS - total;
          if (room <= 0) continue;
          const hits = ev.hits.slice(0, room);
          total += hits.length;
          groups = [...groups, { chapter: ev.chapter || "Untitled section", hits }];
          setState((s) => (s.kind === "searching" ? { ...s, groups } : s));
        } else if (ev.kind === "done") break;
      }
      if (mine === run.current) setState({ kind: "done", query: q, groups });
    } catch {
      if (mine === run.current) setState({ kind: "error", query: q, message: "Search stopped because part of the book couldn't be read." });
    }
  }

  function clear() {
    run.current++;
    controller?.clearSearch();
    setQuery("");
    setState({ kind: "idle" });
  }

  const groups = state.kind === "searching" || state.kind === "done" ? state.groups : [];
  const count = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={onSubmit} className="flex gap-2 px-4 py-3" role="search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search this book</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minLength={2}
            maxLength={100}
            placeholder="Search this book"
            autoFocus
            className="w-full rounded-lg border-2 bg-transparent px-3 py-2 text-[0.95rem] focus:outline-none"
            style={{ borderColor: colors.muted, color: colors.text }}
          />
        </label>
        <button
          type="submit"
          disabled={query.trim().length < 2 || !controller}
          className="rounded-lg px-3 font-semibold disabled:opacity-40"
          style={{ background: colors.text, color: "var(--reader-bg)" }}
        >
          Search
        </button>
      </form>

      <div className="px-4 text-sm" style={{ color: colors.muted }} aria-live="polite">
        {state.kind === "idle" && "Type at least two letters and press Search."}
        {state.kind === "searching" && `Searching… ${Math.round(state.progress * 100)}% (${count} found so far)`}
        {state.kind === "done" &&
          (count === 0
            ? `No matches for “${state.query}”. Check the spelling or try a shorter word.`
            : `${count}${count >= MAX_HITS ? "+" : ""} match${count === 1 ? "" : "es"} for “${state.query}”`)}
        {state.kind === "error" && <span role="alert">{state.message}</span>}
        {state.kind !== "idle" && (
          <button type="button" onClick={clear} className="ml-2 font-semibold underline underline-offset-2">
            Clear
          </button>
        )}
      </div>

      <ol className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g, gi) => (
          <li key={`${gi}-${g.chapter}`} className="mt-3">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.muted }}>
              {g.chapter}
            </p>
            <ul>
              {g.hits.map((h) => (
                <li key={h.cfi}>
                  <button
                    type="button"
                    onClick={() => onPick(h.cfi)}
                    className="flex w-full gap-2 rounded-lg px-2 py-2 text-left text-[0.92rem] leading-snug hover:bg-black/5"
                  >
                    <Icon name="search" className="mt-0.5 h-4 w-4 shrink-0 opacity-50" />
                    {/* foliate already adds "…" where it shortens the excerpt */}
                    <span>
                      {h.excerpt.pre}
                      <mark className="rounded px-0.5 font-semibold" style={{ background: `${colors.link}33`, color: colors.text }}>
                        {h.excerpt.match}
                      </mark>
                      {h.excerpt.post}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
