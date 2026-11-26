"use client";

import { clearReadingData, exportReadingData, readingDataSize, replaceReadingData } from "@/features/reading/storage/readingDb";
import { createBackupParts, type BackupApps, type BackupContents } from "./backup";
import { DATA_APPS, dataApp, type DataAppId } from "./registry";

/**
 * Backing up, restoring, measuring and clearing XPLOR9's data in this browser.
 * Restoring and clearing change storage underneath the open apps, so the UI restarts XPLOR9
 * afterwards (open windows come back) instead of trying to refresh every app in place.
 */

function storage(): Storage {
  return window.localStorage;
}

/** The app's settings exactly as stored (only values that are valid JSON, as every app writes them). */
function readSettings(id: DataAppId): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of dataApp(id).keys) {
    const value = storage().getItem(key);
    if (value === null) continue;
    try {
      JSON.parse(value);
      out[key] = value;
    } catch {
      // not something XPLOR9 wrote; leave it out
    }
  }
  return out;
}

export async function collectBackup(includeBooks: boolean): Promise<{ apps: BackupApps; files: Map<string, ArrayBuffer> }> {
  const apps: BackupApps = {};
  for (const app of DATA_APPS) apps[app.id] = { settings: readSettings(app.id) };
  const { files, ...records } = await exportReadingData(includeBooks);
  apps.reading!.reading = { records: includeBooks ? records : { ...records, imports: [] }, includesBooks: includeBooks };
  return { apps, files };
}

/** Makes the backup file. Throws if the Reading Room's data can't be read. */
export async function createBackupBlob(includeBooks: boolean): Promise<Blob> {
  const { apps, files } = await collectBackup(includeBooks);
  return new Blob(await createBackupParts(apps, files), { type: "application/json" });
}

export interface AppUsage {
  id: DataAppId;
  /** Bytes of settings and records (as in a backup). */
  bytes: number;
  /** Bytes of imported books (Reading Room only). */
  bookBytes: number;
  books: number;
}

export async function storageUsage(): Promise<AppUsage[]> {
  const size = (s: string) => new TextEncoder().encode(s).byteLength;
  let reading = { records: 0, files: 0, books: 0 };
  try {
    reading = await readingDataSize();
  } catch {
    // The Reading Room's storage can't be opened in this browser: nothing is kept there.
  }
  return DATA_APPS.map((app) => {
    const settings = Object.entries(readSettings(app.id)).reduce((n, [k, v]) => n + size(k) + size(v), 0);
    return app.id === "reading"
      ? { id: app.id, bytes: settings + reading.records, bookBytes: reading.files, books: reading.books }
      : { id: app.id, bytes: settings, bookBytes: 0, books: 0 };
  });
}

/** Snapshot of the stored text for these apps' keys (null = not set), for putting things back. */
function snapshot(ids: readonly DataAppId[]): Map<string, string | null> {
  const snap = new Map<string, string | null>();
  for (const id of ids) for (const key of dataApp(id).keys) snap.set(key, storage().getItem(key));
  return snap;
}

function putBack(snap: Map<string, string | null>) {
  for (const [key, value] of snap) {
    try {
      if (value === null) storage().removeItem(key);
      else storage().setItem(key, value);
    } catch {
      // best effort: the values being put back fitted before
    }
  }
}

/**
 * Replaces the chosen apps' data with the backup's: all of it, or (if anything fails, e.g. the
 * browser runs out of space) none of it. Throws an Error with a plain-language message on failure.
 */
export async function restoreBackup(backup: BackupContents, ids: readonly DataAppId[]): Promise<void> {
  const chosen = ids.filter((id) => backup.apps[id]);
  if (chosen.length === 0) throw new Error("Choose at least one app to restore.");
  const before = snapshot(chosen);
  try {
    for (const id of chosen) {
      const settings = backup.apps[id]!.settings;
      for (const key of dataApp(id).keys) {
        if (Object.hasOwn(settings, key)) storage().setItem(key, settings[key]);
        else storage().removeItem(key);
      }
    }
  } catch {
    putBack(before);
    throw new Error("This browser ran out of space for XPLOR9's settings. Nothing was changed.");
  }
  const reading = chosen.includes("reading") ? backup.apps.reading?.reading : undefined;
  if (reading) {
    try {
      await replaceReadingData(reading.records, reading.includesBooks ? backup.files : null);
    } catch (err) {
      putBack(before);
      const full = err instanceof DOMException && err.name === "QuotaExceededError";
      throw new Error(
        full
          ? "This browser doesn't have enough space for the Reading Room's books. Nothing was changed. Free some space, or restore a backup made without imported books."
          : "The Reading Room's data couldn't be written in this browser. Nothing was changed.",
      );
    }
  }
}

/** Deletes the chosen apps' data. Throws an Error with a plain-language message on failure. */
export async function clearAppData(ids: readonly DataAppId[]): Promise<void> {
  for (const id of ids) for (const key of dataApp(id).keys) storage().removeItem(key);
  if (ids.includes("reading")) {
    try {
      await clearReadingData();
    } catch {
      throw new Error("The Reading Room's data couldn't be cleared in this browser. Its settings were cleared.");
    }
  }
}

// ---------- after a restore or clear: XPLOR9 restarts and says what happened ----------

const NOTICE_KEY = "xplor9.session.dataNotice";

export function restartWithNotice(message: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message.slice(0, 300));
  } catch {
    // no notice then; the restart still happens
  }
  window.location.reload();
}

/** The message left by the last restore or clear in this tab (read once). */
export function takeNotice(): string | null {
  try {
    const m = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return m;
  } catch {
    return null;
  }
}

export function peekNotice(): boolean {
  try {
    return sessionStorage.getItem(NOTICE_KEY) !== null;
  } catch {
    return false;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
