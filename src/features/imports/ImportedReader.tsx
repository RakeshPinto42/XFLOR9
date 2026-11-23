"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsDialog } from "@/features/reading/reader/SettingsDialog";
import { THEMES } from "@/features/reading/reader/settings";
import { readerSettings } from "@/features/reading/reader/settingsStore";
import { getImport, getImportBytes, getProgress, importKey, saveProgress, updateImport, type ImportRecord } from "@/features/reading/storage/readingDb";
import { usePlayback } from "@/lib/playback/browser";
import { useLocalStore } from "@/lib/storage/store";
import { ReaderFrame, useReaderBridge } from "./IsolatedReaderHost";
import { IMPORT_ERROR_MESSAGES } from "./limits";

type Loaded = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; record: ImportRecord; position: string | null };

/** Reader page for an imported book: /reading/imported?id=<id>. */
export function ImportedReader() {
  const id = useSearchParams().get("id") ?? "";
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const record = await getImport(id);
      if (!alive) return;
      if (!record) return setLoaded({ kind: "missing" });
      const progress = await getProgress(importKey(record.id));
      void updateImport(record.id, { openedAt: Date.now() });
      if (alive) setLoaded({ kind: "ready", record, position: progress?.cfi ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loaded.kind === "loading") return <p className="px-6 py-16 text-center text-ink-soft">Opening your book…</p>;
  if (loaded.kind === "missing")
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="font-display text-3xl">Book not found</h1>
        <p className="mt-2 text-ink-soft">This book isn&apos;t in this browser. It may have been deleted, or imported in a different browser.</p>
        <Link href="/reading" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 font-semibold text-panel">
          Back to the Reading Room
        </Link>
      </div>
    );
  return <ReaderView record={loaded.record} position={loaded.position} />;
}

function ReaderView({ record, position }: { record: ImportRecord; position: string | null }) {
  const settings = useLocalStore(readerSettings);
  const theme = THEMES[settings.theme];
  const player = usePlayback();
  const settingsRef = useRef<HTMLDialogElement>(null);
  const load = useCallback(() => getImportBytes(record.id), [record.id]);
  const { frameRef, readerOrigin, state, nav } = useReaderBridge({
    load,
    name: record.name,
    format: record.format,
    position,
    settings,
  });
  const [saveFailed, setSaveFailed] = useState(false);

  // Use the book's own title once the reader reports it.
  useEffect(() => {
    if (state.status === "ready" && state.title && state.title !== "Untitled" && state.title !== record.title) {
      void updateImport(record.id, { title: state.title });
    }
  }, [state.status, state.title, record.id, record.title]);

  // Save the reading position (debounced, as in the catalogue reader).
  useEffect(() => {
    if (!state.position) return;
    const pos = state.position;
    const timer = setTimeout(async () => {
      const ok = await saveProgress({ bookKey: importKey(record.id), cfi: pos, fraction: state.fraction, chapter: state.chapter, updatedAt: Date.now() });
      setSaveFailed(!ok);
    }, 600);
    return () => clearTimeout(timer);
  }, [state.position, state.fraction, state.chapter, record.id]);

  // Arrow keys work when focus is on XPLOR9's page (inside the book, the reader handles them).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsRef.current?.open || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") nav("next");
      else if (e.key === "ArrowLeft" || e.key === "PageUp") nav("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const title = state.title ?? record.title;
  const percent = Math.round(state.fraction * 100);
  const ready = state.status === "ready";

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col"
      style={{ background: theme.bg, color: theme.text, paddingBottom: player.source ? "var(--player-h)" : 0 }}
      data-testid="imported-reader"
      data-state={state.status}
    >
      <style>{`:root{--player-h:6rem}@media (min-width:640px){:root{--player-h:5rem}}`}</style>
      <header className="flex items-center gap-2 border-b px-3 py-2 sm:px-5" style={{ borderColor: `${theme.muted}40` }}>
        <Link href="/reading" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-current/10" style={{ color: theme.text }}>
          Back
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
          <p className="truncate text-xs" style={{ color: theme.muted }} aria-live="polite">
            {state.chapter ?? `Your ${record.format.toUpperCase()} · stored in this browser`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => settingsRef.current?.showModal()}
          aria-label="Text and theme settings"
          className="h-10 min-w-10 rounded-full px-2 text-sm font-semibold"
        >
          Aa
        </button>
      </header>

      <main className="relative min-h-0 flex-1">
        <ReaderFrame frameRef={frameRef} readerOrigin={readerOrigin} title={`${title} (your book)`} className="absolute inset-0 h-full w-full border-0" />
        {(state.status === "loading" || state.status === "opening") && (
          <p role="status" className="absolute inset-0 grid place-items-center text-sm" style={{ background: theme.bg, color: theme.muted }}>
            Opening your book…
          </p>
        )}
        {(state.status === "error" || state.status === "disabled") && (
          <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center" style={{ background: theme.bg }}>
            <div className="max-w-md">
              <p className="font-semibold" data-testid="reader-error" data-code={state.error ?? "disabled"}>
                {state.error ? IMPORT_ERROR_MESSAGES[state.error] : "Reading your own files isn't available on this site yet."}
              </p>
              <Link href="/reading" className="mt-4 inline-block rounded-full px-5 py-2 font-semibold" style={{ background: theme.text, color: theme.bg }}>
                Back to the Reading Room
              </Link>
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center gap-3 border-t px-3 py-2 sm:px-5" style={{ borderColor: `${theme.muted}40` }}>
        <button type="button" onClick={() => nav("prev")} disabled={!ready} aria-label="Previous page" className="rounded-full px-4 py-2 font-semibold disabled:opacity-40">
          ‹ Prev
        </button>
        <div className="flex-1 text-center text-sm tabular-nums" style={{ color: theme.muted }}>
          <span data-testid="imported-percent" aria-label={`${percent}% through the book`}>
            {ready ? `${percent}%` : ""}
          </span>
        </div>
        <button type="button" onClick={() => nav("next")} disabled={!ready} aria-label="Next page" className="rounded-full px-4 py-2 font-semibold disabled:opacity-40">
          Next ›
        </button>
      </footer>
      {saveFailed && (
        <p role="status" className="px-4 py-1 text-center text-xs" style={{ color: theme.muted }}>
          This browser isn&apos;t allowing XPLOR9 to save your place, so progress won&apos;t be remembered.
        </p>
      )}

      <SettingsDialog dialogRef={settingsRef} />
    </div>
  );
}
