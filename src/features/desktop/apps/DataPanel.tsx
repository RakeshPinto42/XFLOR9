"use client";

import { useEffect, useRef, useState } from "react";
import {
  BACKUP_ERROR_MESSAGES,
  MAX_BACKUP_BOOK_BYTES,
  MAX_BACKUP_BYTES,
  backupFileName,
  describeApp,
  parseBackup,
  type BackupContents,
} from "@/features/data/backup";
import { clearAppData, createBackupBlob, formatBytes, restartWithNotice, restoreBackup, storageUsage, takeNotice, type AppUsage } from "@/features/data/localData";
import { DATA_APPS, dataApp, type DataAppId } from "@/features/data/registry";

/**
 * Control Panel → Your data: back up everything to a file, restore it (validated first, all or
 * nothing), see the storage each app uses, and clear one app's data or everything.
 */

// The message left by a restore or clear before XPLOR9 restarted (read once per page load).
let notice: string | null | undefined;
export function pendingDataNotice(): string | null {
  if (notice === undefined) notice = takeNotice();
  return notice;
}

type Status = { kind: "ok" | "error" | "busy"; text: string } | null;

export function DataPanel() {
  const [usage, setUsage] = useState<AppUsage[] | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [n, setN] = useState(0); // bump to measure again
  // Shown while the panel stays open; gone once it's closed.
  const [message] = useState(pendingDataNotice);
  useEffect(
    () => () => {
      notice = null;
    },
    [],
  );

  useEffect(() => {
    let live = true;
    storageUsage().then(
      (u) => live && setUsage(u),
      () => live && setUsageFailed(true),
    );
    navigator.storage?.estimate?.().then((e) => live && setEstimate(e), () => {});
    navigator.storage?.persisted?.().then((p) => live && setPersisted(p), () => {});
    return () => {
      live = false;
    };
  }, [n]);

  const reading = usage?.find((u) => u.id === "reading");

  return (
    <div className="max-w-2xl space-y-6">
      {message && (
        <p role="status" className="xp-notice">
          {message}
        </p>
      )}
      <p className="opacity-80">
        Everything XPLOR9 remembers is kept only in this browser. Clearing the browser&apos;s data, or using another browser or computer, starts afresh.
        A backup file keeps it safe and lets you move it.
      </p>
      <BackUp bookBytes={reading?.bookBytes ?? 0} books={reading?.books ?? 0} />
      <Restore />
      <Usage usage={usage} failed={usageFailed} estimate={estimate} onChanged={() => setN((x) => x + 1)} />
      <Persist persisted={persisted} onChange={setPersisted} />
    </div>
  );
}

function BackUp({ bookBytes, books }: { bookBytes: number; books: number }) {
  const tooBig = bookBytes > MAX_BACKUP_BOOK_BYTES;
  const [withBooks, setWithBooks] = useState(true);
  const [status, setStatus] = useState<Status>(null);
  const include = withBooks && !tooBig && books > 0;

  const run = async () => {
    setStatus({ kind: "busy", text: "Making the backup…" });
    try {
      const blob = await createBackupBlob(include);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName();
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus({ kind: "ok", text: `Backup saved as ${a.download} (${formatBytes(blob.size)}). Keep it somewhere safe.` });
    } catch {
      setStatus({ kind: "error", text: "The backup couldn't be made: the Reading Room's data couldn't be read in this browser." });
    }
  };

  return (
    <section aria-labelledby="data-backup">
      <h3 id="data-backup" className="mb-2 font-bold">
        Back up
      </h3>
      <p className="mb-2">Saves your favourites, playlists, progress, notes, scores and settings from every app to one file.</p>
      {books > 0 && (
        <label className="mb-2 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={include} disabled={tooBig} onChange={(e) => setWithBooks(e.target.checked)} />
          <span>
            Include my imported books ({books} {books === 1 ? "book" : "books"}, {formatBytes(bookBytes)})
            {tooBig && <span className="block opacity-80">Too large for one backup file. Keep the original files; their progress and bookmarks are still backed up.</span>}
          </span>
        </label>
      )}
      <button type="button" className="xp-button" onClick={run} disabled={status?.kind === "busy"}>
        Back up to a file…
      </button>
      <StatusLine status={status} />
    </section>
  );
}

function Restore() {
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupContents | null>(null);
  const [chosen, setChosen] = useState<DataAppId[]>([]);
  const [status, setStatus] = useState<Status>(null);

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = ""; // the same file can be chosen again
    if (!file) return;
    setBackup(null);
    if (file.size > MAX_BACKUP_BYTES) return setStatus({ kind: "error", text: BACKUP_ERROR_MESSAGES["too-large"] });
    setStatus({ kind: "busy", text: "Checking the backup…" });
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setStatus({ kind: "error", text: "This file couldn't be read." });
    }
    const result = await parseBackup(text);
    if (!result.ok) return setStatus({ kind: "error", text: BACKUP_ERROR_MESSAGES[result.error] });
    setBackup(result.backup);
    setChosen(DATA_APPS.filter((a) => result.backup.apps[a.id]).map((a) => a.id));
    setStatus(null);
  };

  const run = async () => {
    if (!backup) return;
    setStatus({ kind: "busy", text: "Restoring…" });
    try {
      await restoreBackup(backup, chosen);
    } catch (err) {
      return setStatus({ kind: "error", text: err instanceof Error ? err.message : "The backup couldn't be restored. Nothing was changed." });
    }
    const names = chosen.map((id) => dataApp(id).name).join(", ");
    restartWithNotice(`Restored from the backup made on ${formatDate(backup.createdAt)}: ${names}.`);
  };

  const readingBackup = backup?.apps.reading?.reading;
  return (
    <section aria-labelledby="data-restore">
      <h3 id="data-restore" className="mb-2 font-bold">
        Restore
      </h3>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => choose(e.target.files?.[0])} />
      {!backup && (
        <button type="button" className="xp-button" onClick={() => input.current?.click()} disabled={status?.kind === "busy"}>
          Restore from a backup…
        </button>
      )}
      {backup && (
        <form
          aria-label="Restore this backup"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <fieldset className="xp-groupbox">
            <legend>Backup made on {formatDate(backup.createdAt)}</legend>
            <ul className="space-y-1">
              {DATA_APPS.filter((a) => backup.apps[a.id]).map((a) => (
                <li key={a.id}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={chosen.includes(a.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))}
                    />
                    <span>
                      <b>{a.name}</b>: {describeApp(backup.apps[a.id]!)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {backup.skipped > 0 && <p className="mt-2 opacity-80">{backup.skipped} item(s) from another version of XPLOR9 will be left out.</p>}
            {readingBackup && !readingBackup.includesBooks && chosen.includes("reading") && (
              <p className="mt-2 opacity-80">This backup has no imported books; the books already in this browser are kept.</p>
            )}
          </fieldset>
          <p className="my-2">
            Restoring replaces what XPLOR9 has now for the ticked apps, and restarts XPLOR9. This can&apos;t be undone, so back up first if you might
            want today&apos;s data.
          </p>
          <div className="flex gap-2">
            <button type="submit" className="xp-button xp-button--primary" disabled={chosen.length === 0 || status?.kind === "busy"}>
              Restore
            </button>
            <button
              type="button"
              className="xp-button"
              onClick={() => {
                setBackup(null);
                setStatus(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <StatusLine status={status} />
    </section>
  );
}

function Usage({
  usage,
  failed,
  estimate,
  onChanged,
}: {
  usage: AppUsage[] | null;
  failed: boolean;
  estimate: { usage?: number; quota?: number } | null;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState<DataAppId | "all" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const clear = async (target: DataAppId | "all") => {
    const ids = target === "all" ? DATA_APPS.map((a) => a.id) : [target];
    setStatus({ kind: "busy", text: "Clearing…" });
    try {
      await clearAppData(ids);
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "The data couldn't be cleared." });
      onChanged();
      return;
    }
    restartWithNotice(target === "all" ? "All of XPLOR9's data was cleared." : `${dataApp(target).name}'s data was cleared.`);
  };

  const total = usage?.reduce((s, u) => s + u.bytes + u.bookBytes, 0) ?? 0;
  return (
    <section aria-labelledby="data-usage">
      <h3 id="data-usage" className="mb-2 font-bold">
        Storage used
      </h3>
      {failed && <p role="alert">The storage used couldn&apos;t be measured in this browser.</p>}
      {!usage && !failed && <p>Measuring…</p>}
      {usage && (
        <table className="xp-table w-full">
          <thead>
            <tr>
              <th scope="col">App</th>
              <th scope="col">Size</th>
              <th scope="col">
                <span className="sr-only">Clear</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => {
              const app = dataApp(u.id);
              const empty = u.bytes + u.bookBytes === 0;
              return (
                <tr key={u.id}>
                  <th scope="row" className="font-normal">
                    {app.name}
                    {u.books > 0 && (
                      <span className="block text-[12px] opacity-75">
                        including {u.books} imported {u.books === 1 ? "book" : "books"} ({formatBytes(u.bookBytes)})
                      </span>
                    )}
                  </th>
                  <td>{empty ? "Nothing saved" : formatBytes(u.bytes + u.bookBytes)}</td>
                  <td className="text-right">
                    <button type="button" className="xp-button" disabled={empty || status?.kind === "busy"} onClick={() => setConfirm(u.id)} aria-label={`Clear ${app.name}'s data`}>
                      Clear…
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {usage && (
        <p className="mt-2">
          XPLOR9 keeps {formatBytes(total)} in this browser
          {estimate?.quota ? `; the browser allows this site up to about ${formatBytes(estimate.quota)}` : ""}.
        </p>
      )}
      {usage && (
        <button type="button" className="xp-button mt-2" disabled={total === 0 || status?.kind === "busy"} onClick={() => setConfirm("all")}>
          Clear everything…
        </button>
      )}
      {confirm && (
        <div role="alertdialog" aria-labelledby="data-confirm-text" className="xp-groupbox mt-3">
          <p id="data-confirm-text" className="mb-2">
            {confirm === "all"
              ? "Clear everything XPLOR9 keeps in this browser, in every app, including imported books? XPLOR9 restarts afterwards. This can't be undone."
              : `Clear ${dataApp(confirm).name}'s data (${dataApp(confirm).holds})? XPLOR9 restarts afterwards. This can't be undone.`}
          </p>
          <div className="flex gap-2">
            <button type="button" className="xp-button xp-button--primary" onClick={() => clear(confirm)} disabled={status?.kind === "busy"}>
              {confirm === "all" ? "Clear everything" : `Clear ${dataApp(confirm).name}'s data`}
            </button>
            <button type="button" className="xp-button" onClick={() => setConfirm(null)} autoFocus>
              Cancel
            </button>
          </div>
        </div>
      )}
      <StatusLine status={status} />
    </section>
  );
}

function Persist({ persisted, onChange }: { persisted: boolean | null; onChange: (p: boolean) => void }) {
  const [refused, setRefused] = useState(false);
  if (persisted === null || typeof navigator.storage?.persist !== "function") return null;
  return (
    <section aria-labelledby="data-persist">
      <h3 id="data-persist" className="mb-2 font-bold">
        Automatic clean-up
      </h3>
      {persisted ? (
        <p>This browser won&apos;t remove XPLOR9&apos;s data to free up space. (Clearing the browser&apos;s data still removes it.)</p>
      ) : (
        <>
          <p className="mb-2">When the computer runs low on space, the browser may remove XPLOR9&apos;s data. You can ask it not to.</p>
          <button
            type="button"
            className="xp-button"
            onClick={async () => {
              const ok = await navigator.storage.persist().catch(() => false);
              onChange(ok);
              setRefused(!ok);
            }}
          >
            Keep XPLOR9&apos;s data
          </button>
          {refused && <p className="mt-2" role="status">The browser didn&apos;t agree. Browsers decide this themselves, often by how much a site is used; a backup file is the sure way to keep your data.</p>}
        </>
      )}
    </section>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return <p className="sr-only" aria-live="polite" />;
  return (
    <p className="mt-2" role={status.kind === "error" ? "alert" : "status"} data-status={status.kind}>
      {status.text}
    </p>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}
