"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Reading Room storage in IndexedDB (this browser only; nothing is sent to a server).
 * Version 1 holds reading progress. Later steps add stores (bookmarks, favourites,
 * imported files) through new versions in `upgrade`, without touching saved progress.
 */

export interface ProgressRecord {
  /** "cat:<catalogue id>" for catalogue books ("local:<fingerprint>" for imports later). */
  bookKey: string;
  /** Exact position in the book (EPUB CFI). */
  cfi: string;
  /** 0..1 through the whole book. */
  fraction: number;
  chapter: string | null;
  updatedAt: number;
}

interface ReadingDB extends DBSchema {
  progress: { key: string; value: ProgressRecord };
}

const DB_NAME = "xplor9-reading";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ReadingDB>> | null = null;

function db() {
  dbPromise ??= openDB<ReadingDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore("progress", { keyPath: "bookKey" });
    },
  }).catch((err) => {
    dbPromise = null; // allow a later retry
    throw err;
  });
  return dbPromise;
}

export const catalogueKey = (id: string) => `cat:${id}`;

/** Validates a stored record (the browser's storage is outside our control). */
export function parseProgress(raw: unknown): ProgressRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.bookKey !== "string" || !/^(cat|local):[\w-]{1,120}$/.test(r.bookKey)) return null;
  if (typeof r.cfi !== "string" || !r.cfi.startsWith("epubcfi(") || r.cfi.length > 2000) return null;
  const fraction = typeof r.fraction === "number" && Number.isFinite(r.fraction) ? Math.min(1, Math.max(0, r.fraction)) : 0;
  return {
    bookKey: r.bookKey,
    cfi: r.cfi,
    fraction,
    chapter: typeof r.chapter === "string" ? r.chapter.slice(0, 200) : null,
    updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
  };
}

export async function getProgress(bookKey: string): Promise<ProgressRecord | null> {
  try {
    return parseProgress(await (await db()).get("progress", bookKey));
  } catch {
    return null;
  }
}

/** Returns false if this browser can't store data (e.g. storage blocked). */
export async function saveProgress(record: ProgressRecord): Promise<boolean> {
  const valid = parseProgress(record);
  if (!valid) return false;
  try {
    await (await db()).put("progress", valid);
    return true;
  } catch {
    return false;
  }
}

/** All saved progress, most recently read first. */
export async function listProgress(): Promise<ProgressRecord[]> {
  try {
    const all = await (await db()).getAll("progress");
    return all
      .map(parseProgress)
      .filter((r): r is ProgressRecord => r !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Books worth showing under "Continue reading": started, not finished. */
export function inProgress(records: ProgressRecord[]): ProgressRecord[] {
  return records.filter((r) => r.fraction > 0 && r.fraction < 0.995);
}
