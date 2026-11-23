"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayback } from "@/lib/playback/browser";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";
import { catalogueKey, getProgress, saveProgress } from "../storage/readingDb";
import { openEpub, turnOnKey, type EpubController, type ReaderLocation, type TocItem } from "./epubEngine";
import {
  DEFAULT_SETTINGS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  THEMES,
  bookStylesheet,
  clampFontScale,
  parseSettings,
  type ReaderTheme,
} from "./settings";

export interface ReaderBook {
  id: string;
  title: string;
  authors: string[];
  path: string;
  sha256: string;
}

const readerSettings = createLocalStore(STORAGE_KEYS.readerSettings, DEFAULT_SETTINGS, parseSettings);

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * Full-screen EPUB reader. Keeps the site's mini-player visible (radio keeps playing)
 * and saves your place in this browser as you read.
 */
export function EpubReader({ book }: { book: ReaderBook }) {
  const settings = useLocalStore(readerSettings);
  const player = usePlayback();
  const surface = useRef<HTMLDivElement>(null);
  const controller = useRef<EpubController | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const contentsRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const pendingSave = useRef<ReaderLocation | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = THEMES[settings.theme];

  const flushSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const loc = pendingSave.current;
    if (!loc) return;
    pendingSave.current = null;
    void saveProgress({
      bookKey: catalogueKey(book.id),
      cfi: loc.cfi,
      fraction: loc.fraction,
      chapter: loc.chapter,
      updatedAt: Date.now(),
    }).then((ok) => !ok && setSaveFailed(true));
  }, [book.id]);

  // Open the book: fetch, verify it is the exact rights-verified file, resume position.
  useEffect(() => {
    let cancelled = false;
    const el = surface.current;
    if (!el) return;
    (async () => {
      try {
        const res = await fetch(book.path);
        if (!res.ok) throw new Error(`The book file couldn't be downloaded (HTTP ${res.status}).`);
        const blob = await res.blob();
        const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
        if (hex !== book.sha256) throw new Error("This book file doesn't match its verified copy, so it wasn't opened.");
        const saved = await getProgress(catalogueKey(book.id));
        if (cancelled) return;
        const ctrl = await openEpub(el, blob, {
          lastCfi: saved?.cfi ?? null,
          styles: bookStylesheet(readerSettings.get(), window.location.origin),
          onRelocate: (loc) => {
            setLocation(loc);
            pendingSave.current = loc;
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(flushSave, 600);
          },
        });
        if (cancelled) {
          ctrl.destroy();
          return;
        }
        controller.current = ctrl;
        setToc(ctrl.toc);
        setStatus({ kind: "ready" });
      } catch (err) {
        if (!cancelled)
          setStatus({ kind: "error", message: err instanceof Error ? err.message : "This book couldn't be opened." });
      }
    })();
    return () => {
      cancelled = true;
      flushSave();
      controller.current?.destroy();
      controller.current = null;
      el.replaceChildren();
    };
  }, [book.id, book.path, book.sha256, attempt, flushSave]);

  // Save immediately if the tab is hidden or closed mid-read.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushSave();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushSave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushSave);
    };
  }, [flushSave]);

  // Apply theme and text size changes to the open book.
  useEffect(() => {
    controller.current?.setStyles(bookStylesheet(settings, window.location.origin));
  }, [settings, status.kind]);

  // Arrow keys work when focus is on the reader chrome too (not only inside the book frame).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (contentsRef.current?.open || settingsRef.current?.open) return;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (controller.current) turnOnKey(e, controller.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The reader covers the page: stop the page underneath from scrolling.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  const setTheme = (t: ReaderTheme) => readerSettings.set((s) => ({ ...s, theme: t }));
  const setScale = (v: number) => readerSettings.set((s) => ({ ...s, fontScale: clampFontScale(v) }));
  const percent = location ? Math.round(location.fraction * 100) : 0;
  const playerVisible = !!player.source;

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col"
      style={{ background: theme.bg, color: theme.text, paddingBottom: playerVisible ? "var(--player-h)" : 0 }}
    >
      <style>{`:root{--player-h:6rem}@media (min-width:640px){:root{--player-h:5rem}}`}</style>

      <header className="flex items-center gap-2 border-b px-3 py-2 sm:px-5" style={{ borderColor: `${theme.muted}40` }}>
        <Link
          href={`/reading/${book.id}`}
          className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-current/10"
          style={{ color: theme.text }}
        >
          Back
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-sm font-semibold sm:text-base">{book.title}</h1>
          <p className="truncate text-xs" style={{ color: theme.muted }} aria-live="polite">
            {location?.chapter ?? book.authors.join(", ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => contentsRef.current?.showModal()}
          disabled={toc.length === 0}
          className="rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Contents
        </button>
        <button
          type="button"
          onClick={() => settingsRef.current?.showModal()}
          aria-label="Text and theme settings"
          className="rounded-full px-3 py-2 text-sm font-semibold"
        >
          Aa
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={surface} className="absolute inset-0" aria-label={`${book.title}, book text`} role="region" />
        {status.kind === "loading" && (
          <p className="absolute inset-0 grid place-items-center text-sm" style={{ color: theme.muted }}>
            Opening the book…
          </p>
        )}
        {status.kind === "error" && (
          <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="font-semibold">{status.message}</p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStatus({ kind: "loading" });
                    setAttempt((a) => a + 1);
                  }}
                  className="rounded-full border-2 px-4 py-1.5 text-sm font-semibold"
                  style={{ borderColor: theme.text }}
                >
                  Try again
                </button>
                <Link href={`/reading/${book.id}`} className="rounded-full px-4 py-1.5 text-sm font-semibold underline">
                  Back to the book
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t px-3 py-2 sm:px-5" style={{ borderColor: `${theme.muted}40` }}>
        <button
          type="button"
          onClick={() => controller.current?.prev()}
          disabled={status.kind !== "ready"}
          className="rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-40"
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-3 text-xs" style={{ color: theme.muted }}>
          <span className="sr-only">Position in book</span>
          <input
            key={percent}
            type="range"
            min={0}
            max={100}
            defaultValue={percent}
            disabled={status.kind !== "ready"}
            onChange={(e) => void controller.current?.goToFraction(Number(e.currentTarget.value) / 100)}
            aria-valuetext={`${percent}% through the book`}
            className="min-w-0 flex-1"
            style={{ accentColor: theme.link }}
          />
          <span className="w-10 shrink-0 text-right tabular-nums">{percent}%</span>
        </label>
        <button
          type="button"
          onClick={() => controller.current?.next()}
          disabled={status.kind !== "ready"}
          className="rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-40"
          aria-label="Next page"
        >
          Next ›
        </button>
      </footer>

      {saveFailed && (
        <p role="status" className="px-4 py-1 text-center text-xs" style={{ color: theme.muted }}>
          This browser isn&apos;t allowing XPLOR9 to save your place, so progress won&apos;t be remembered.
        </p>
      )}

      {/* Contents: a native modal dialog gives focus trapping and Escape-to-close. */}
      <dialog
        ref={contentsRef}
        aria-label="Contents"
        className="m-0 h-full max-h-none w-full max-w-sm p-0 backdrop:bg-black/40 sm:h-dvh"
        style={{ background: theme.bg, color: theme.text }}
        onClick={(e) => e.target === e.currentTarget && contentsRef.current?.close()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: `${theme.muted}40` }}>
          <h2 className="font-semibold">Contents</h2>
          <button type="button" onClick={() => contentsRef.current?.close()} className="px-2 py-1 text-sm font-semibold">
            Close
          </button>
        </div>
        <nav aria-label="Chapters" className="overflow-y-auto px-2 py-2" style={{ maxHeight: "calc(100dvh - 4rem)" }}>
          <TocList
            items={toc}
            current={location?.chapterHref ?? null}
            linkColor={theme.link}
            onPick={(href) => {
              contentsRef.current?.close();
              void controller.current?.goTo(href);
            }}
          />
        </nav>
      </dialog>

      <dialog
        ref={settingsRef}
        aria-label="Text and theme settings"
        className="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-2xl p-5 backdrop:bg-black/30 sm:mb-auto sm:rounded-2xl"
        style={{ background: theme.bg, color: theme.text }}
        onClick={(e) => e.target === e.currentTarget && settingsRef.current?.close()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Text and theme</h2>
          <button type="button" onClick={() => settingsRef.current?.close()} className="px-2 py-1 text-sm font-semibold">
            Close
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="w-24 text-sm">Text size</span>
          <button
            type="button"
            onClick={() => setScale(settings.fontScale - FONT_SCALE_STEP)}
            disabled={settings.fontScale <= FONT_SCALE_MIN}
            aria-label="Smaller text"
            className="h-10 w-10 rounded-full border-2 text-sm font-bold disabled:opacity-40"
            style={{ borderColor: theme.muted }}
          >
            A−
          </button>
          <output className="w-14 text-center tabular-nums" aria-live="polite">
            {settings.fontScale}%
          </output>
          <button
            type="button"
            onClick={() => setScale(settings.fontScale + FONT_SCALE_STEP)}
            disabled={settings.fontScale >= FONT_SCALE_MAX}
            aria-label="Larger text"
            className="h-10 w-10 rounded-full border-2 text-lg font-bold disabled:opacity-40"
            style={{ borderColor: theme.muted }}
          >
            A+
          </button>
        </div>
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm">Theme</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(THEMES) as ReaderTheme[]).map((t) => (
              <label
                key={t}
                className="cursor-pointer rounded-xl border-2 px-2 py-3 text-center text-sm font-semibold has-[:checked]:ring-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
                style={{
                  background: THEMES[t].bg,
                  color: THEMES[t].text,
                  borderColor: settings.theme === t ? THEMES[t].link : `${THEMES[t].muted}55`,
                }}
              >
                <input type="radio" name="reader-theme" checked={settings.theme === t} onChange={() => setTheme(t)} className="sr-only" />
                {THEMES[t].label}
              </label>
            ))}
          </div>
        </fieldset>
      </dialog>
    </div>
  );
}

function TocList({
  items,
  current,
  linkColor,
  onPick,
  depth = 0,
}: {
  items: TocItem[];
  current: string | null;
  linkColor: string;
  onPick: (href: string) => void;
  depth?: number;
}) {
  return (
    <ul>
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          <button
            type="button"
            onClick={() => onPick(item.href)}
            aria-current={item.href === current ? "true" : undefined}
            className="w-full rounded-lg px-3 py-2 text-left text-[0.95rem] hover:bg-black/5"
            style={{ paddingLeft: `${0.75 + depth}rem`, ...(item.href === current ? { color: linkColor, fontWeight: 700 } : {}) }}
          >
            {item.label}
          </button>
          {item.children.length > 0 && (
            <TocList items={item.children} current={current} linkColor={linkColor} onPick={onPick} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}
