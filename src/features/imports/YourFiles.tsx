"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  deleteImport,
  importKey,
  listImports,
  listProgress,
  type ImportRecord,
} from "@/features/reading/storage/readingDb";
import { STORAGE_WARN_RATIO, formatBytes, importFile, storageInfo, type StorageInfo } from "./importFile";
import { IMPORT_ERROR_MESSAGES, ImportError } from "./limits";
import { readerOriginFor } from "./origins";

type Row = ImportRecord & { fraction: number };
type Notice = { kind: "ok" | "error"; text: string } | null;

const noSubscribe = () => () => {};

async function load(): Promise<{ rows: Row[]; storage: StorageInfo | null }> {
  const [imports, progress, storage] = await Promise.all([listImports(), listProgress(), storageInfo()]);
  const byKey = new Map(progress.map((p) => [p.bookKey, p.fraction]));
  return { rows: imports.map((r) => ({ ...r, fraction: byKey.get(importKey(r.id)) ?? 0 })), storage };
}

/**
 * "Your files": EPUB and PDF books the visitor imports. Files stay in this browser (IndexedDB on
 * XPLOR9's origin) and are only ever opened in the isolated reader.
 */
export function YourFiles() {
  // null on the server; true/false in the browser (imports need a separate reader origin).
  const enabled = useSyncExternalStore(noSubscribe, () => !!readerOriginFor(window.location), () => null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const apply = (data: Awaited<ReturnType<typeof load>>) => {
    setRows(data.rows);
    setStorage(data.storage);
  };
  const refresh = async () => apply(await load());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void load().then((data) => {
      if (alive) apply(data);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const rec = await importFile(file);
      setNotice({ kind: "ok", text: `Added “${rec.title}”. It's stored only in this browser.` });
      await refresh();
    } catch (err) {
      const text = err instanceof ImportError ? IMPORT_ERROR_MESSAGES[err.code] : "This file couldn't be saved in this browser.";
      setNotice({ kind: "error", text });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function onDelete(row: Row) {
    setConfirming(null);
    const ok = await deleteImport(row.id);
    setNotice(ok ? { kind: "ok", text: `Deleted “${row.title}” and its reading progress.` } : { kind: "error", text: "That book couldn't be deleted. Try again." });
    await refresh();
  }

  if (enabled === null) return null;
  const used = rows?.reduce((n, r) => n + r.size, 0) ?? 0;
  const nearlyFull = storage && storage.usage / storage.quota >= STORAGE_WARN_RATIO;

  return (
    <section aria-labelledby="your-files-heading" className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="your-files-heading" className="font-display text-2xl">
            Your files
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {enabled
              ? "Read your own EPUB and PDF books. They stay in this browser and are never uploaded."
              : "Reading your own files isn't available on this site yet."}
          </p>
        </div>
        {enabled && (
          <>
            <input
              ref={input}
              id="import-file"
              type="file"
              accept=".epub,.pdf,application/epub+zip,application/pdf"
              className="peer sr-only"
              onChange={(e) => void onPick(e.target.files?.[0])}
              disabled={busy}
            />
            <label
              htmlFor="import-file"
              aria-disabled={busy}
              className="cursor-pointer rounded-full bg-ink px-5 py-[0.65rem] font-semibold text-panel hover:bg-ink-soft aria-disabled:cursor-wait aria-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
            >
              {busy ? "Adding…" : "Import a book"}
            </label>
          </>
        )}
      </div>

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-3 rounded-xl px-4 py-2 text-sm font-semibold ${notice.kind === "error" ? "bg-music/15 text-ink" : "bg-reading/30 text-ink"}`}
        >
          {notice.text}
        </p>
      )}

      {enabled && rows && rows.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-2xl border-2 border-ink/15 bg-panel p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-10 shrink-0 place-items-center rounded-md bg-ink text-[0.65rem] font-bold uppercase text-panel"
                >
                  {r.format}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 font-semibold leading-snug">{r.title}</p>
                  <p className="text-xs text-ink-soft">
                    {r.format.toUpperCase()} · {formatBytes(r.size)}
                    {r.fraction > 0 && ` · ${Math.round(r.fraction * 100)}% read`}
                  </p>
                </div>
              </div>
              {confirming === r.id ? (
                <div role="group" aria-label={`Delete ${r.title}?`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-full">Delete this book and its reading progress from this browser?</span>
                  <button type="button" onClick={() => void onDelete(r)} className="rounded-full bg-ink px-4 py-2 font-semibold text-panel">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-full border-2 border-ink px-4 py-[0.4rem] font-semibold">
                    Keep
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href={`/reading/imported?id=${r.id}`}
                    className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-panel hover:bg-ink-soft"
                  >
                    {r.fraction > 0 ? "Continue" : "Open"}
                    <span className="sr-only"> {r.title}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirming(r.id)}
                    className="rounded-full border-2 border-ink/40 px-4 py-[0.4rem] text-sm font-semibold hover:border-ink"
                  >
                    Delete<span className="sr-only"> {r.title}</span>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {enabled && rows && (
        <p className="mt-3 text-xs text-ink-soft" data-testid="storage-usage">
          {rows.length === 0 ? "No imported books yet." : `Your books use ${formatBytes(used)}.`}
          {storage && ` This browser has about ${formatBytes(Math.max(0, storage.quota - storage.usage))} free for XPLOR9.`}
        </p>
      )}
      {nearlyFull && (
        <p role="alert" className="mt-2 text-sm font-semibold text-ink">
          Storage for XPLOR9 in this browser is nearly full. Delete books you&apos;ve finished to make room.
        </p>
      )}
    </section>
  );
}
