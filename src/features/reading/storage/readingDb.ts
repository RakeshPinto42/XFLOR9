"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Reading Room storage in IndexedDB (this browser only; nothing is sent to a server).
 * Version 1 holds reading progress. Later steps add stores (bookmarks, favourites,
 * imported files) through new versions in `upgrade`, without touching saved progress.
 */

export interface ProgressRecord {
  /** "cat:<catalogue id>" for catalogue books, "local:<import id>" for imported files. */
  bookKey: string;
  /** Exact position: an EPUB CFI, or "pdf:page=<n>" for imported PDFs. */
  cfi: string;
  /** 0..1 through the whole book. */
  fraction: number;
  chapter: string | null;
  updatedAt: number;
}

export interface BookmarkRecord {
  id: string;
  bookKey: string;
  /** Collapsed CFI (a single point): independent of font size, theme and screen size. */
  cfi: string;
  chapter: string | null;
  /** The first words on the bookmarked page, so the list is recognisable. */
  excerpt: string;
  fraction: number;
  createdAt: number;
}

export interface FavouriteRecord {
  bookKey: string;
  addedAt: number;
}

export interface RecentRecord {
  bookKey: string;
  openedAt: number;
}

/**
 * A book file imported by the user. Stored only in this browser; never uploaded.
 * The details (this record) and the bytes (ImportFileRecord) are stored separately, so listing
 * books never loads their contents. Bytes are stored as an ArrayBuffer because some browsers
 * (WebKit, e.g. Safari private browsing) can't store Blob/File objects in IndexedDB.
 */
export interface ImportRecord {
  id: string;
  format: "epub" | "pdf";
  /** Original file name (shown until the reader reports the book's own title). */
  name: string;
  title: string;
  size: number;
  addedAt: number;
  openedAt: number | null;
}

interface ImportFileRecord {
  id: string;
  data: ArrayBuffer;
}

interface ReadingDB extends DBSchema {
  imports: { key: string; value: ImportRecord };
  importFiles: { key: string; value: ImportFileRecord };
  progress: { key: string; value: ProgressRecord };
  bookmarks: { key: string; value: BookmarkRecord; indexes: { byBook: string } };
  favourites: { key: string; value: FavouriteRecord };
  recent: { key: string; value: RecentRecord };
}

const DB_NAME = "xplor9-reading";
/** v1 (R2): progress. v2 (R3): bookmarks, favourites, recent. v3 (R4): imports. Upgrades never touch existing stores. */
const DB_VERSION = 3;
export const MAX_RECENT_BOOKS = 12;
export const MAX_BOOKMARKS_PER_BOOK = 200;

let dbPromise: Promise<IDBPDatabase<ReadingDB>> | null = null;

/** Test helper: forget the open connection (used with a fresh fake IndexedDB). */
export function resetReadingDbConnection() {
  dbPromise = null;
}

function db() {
  dbPromise ??= openDB<ReadingDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore("progress", { keyPath: "bookKey" });
      if (oldVersion < 2) {
        const bookmarks = database.createObjectStore("bookmarks", { keyPath: "id" });
        bookmarks.createIndex("byBook", "bookKey");
        database.createObjectStore("favourites", { keyPath: "bookKey" });
        database.createObjectStore("recent", { keyPath: "bookKey" });
      }
      if (oldVersion < 3) {
        database.createObjectStore("imports", { keyPath: "id" });
        database.createObjectStore("importFiles", { keyPath: "id" });
      }
    },
  }).catch((err) => {
    dbPromise = null; // allow a later retry
    throw err;
  });
  return dbPromise;
}

export const catalogueKey = (id: string) => `cat:${id}`;
export const importKey = (id: string) => `local:${id}`;

/** Validates a stored record (the browser's storage is outside our control). */
export function parseProgress(raw: unknown): ProgressRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.bookKey !== "string" || !/^(cat|local):[\w-]{1,120}$/.test(r.bookKey)) return null;
  if (typeof r.cfi !== "string" || r.cfi.length > 2000) return null;
  const isPdfPage = /^pdf:page=[1-9]\d{0,5}$/.test(r.cfi);
  if (!r.cfi.startsWith("epubcfi(") && !(isPdfPage && r.bookKey.startsWith("local:"))) return null;
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

// ---------- validation for R3 stores ----------

const BOOK_KEY = /^(cat|local):[\w-]{1,120}$/;
const isCfi = (v: unknown): v is string => typeof v === "string" && /^epubcfi\(.+\)$/.test(v) && v.length <= 2000;
const finite = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function parseBookmark(raw: unknown): BookmarkRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^[\w-]{8,64}$/.test(r.id)) return null;
  if (typeof r.bookKey !== "string" || !BOOK_KEY.test(r.bookKey) || !isCfi(r.cfi)) return null;
  return {
    id: r.id,
    bookKey: r.bookKey,
    cfi: r.cfi,
    chapter: typeof r.chapter === "string" ? r.chapter.slice(0, 200) : null,
    excerpt: typeof r.excerpt === "string" ? r.excerpt.slice(0, 200) : "",
    fraction: Math.min(1, Math.max(0, finite(r.fraction))),
    createdAt: finite(r.createdAt),
  };
}

function parseKeyed<K extends "addedAt" | "openedAt">(raw: unknown, field: K) {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.bookKey !== "string" || !BOOK_KEY.test(r.bookKey)) return null;
  return { bookKey: r.bookKey, [field]: finite(r[field]) } as { bookKey: string } & Record<K, number>;
}

/** Turns a bookmark excerpt from raw page text into one tidy line. */
export function tidyExcerpt(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// ---------- bookmarks ----------

export async function listBookmarks(bookKey: string): Promise<BookmarkRecord[]> {
  try {
    const all = await (await db()).getAllFromIndex("bookmarks", "byBook", bookKey);
    return all
      .map(parseBookmark)
      .filter((b): b is BookmarkRecord => b !== null)
      .sort((a, b) => a.fraction - b.fraction || a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Saves a bookmark. Returns it, or null if it was invalid or the browser can't store data. */
export async function addBookmark(input: Omit<BookmarkRecord, "id" | "createdAt">): Promise<BookmarkRecord | null> {
  const record = parseBookmark({ ...input, id: crypto.randomUUID(), createdAt: Date.now() });
  if (!record) return null;
  try {
    const database = await db();
    const count = await database.countFromIndex("bookmarks", "byBook", record.bookKey);
    if (count >= MAX_BOOKMARKS_PER_BOOK) return null;
    await database.put("bookmarks", record);
    return record;
  } catch {
    return null;
  }
}

export async function deleteBookmark(id: string): Promise<boolean> {
  try {
    await (await db()).delete("bookmarks", id);
    return true;
  } catch {
    return false;
  }
}

// ---------- favourites ----------

export async function listFavourites(): Promise<FavouriteRecord[]> {
  try {
    return (await (await db()).getAll("favourites"))
      .map((r) => parseKeyed(r, "addedAt"))
      .filter((r): r is FavouriteRecord => r !== null)
      .sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function isFavourite(bookKey: string): Promise<boolean> {
  try {
    return !!(await (await db()).get("favourites", bookKey));
  } catch {
    return false;
  }
}

/** Sets the favourite state. Returns the new state, or null if it couldn't be saved. */
export async function setFavourite(bookKey: string, favourite: boolean): Promise<boolean | null> {
  if (!BOOK_KEY.test(bookKey)) return null;
  try {
    const database = await db();
    if (favourite) await database.put("favourites", { bookKey, addedAt: Date.now() });
    else await database.delete("favourites", bookKey);
    return favourite;
  } catch {
    return null;
  }
}

// ---------- recently opened ----------

/** Records that a book was opened; keeps only the newest MAX_RECENT_BOOKS. */
export async function recordOpened(bookKey: string): Promise<boolean> {
  if (!BOOK_KEY.test(bookKey)) return false;
  try {
    const database = await db();
    await database.put("recent", { bookKey, openedAt: Date.now() });
    const all = (await database.getAll("recent")).sort((a, b) => b.openedAt - a.openedAt);
    for (const old of all.slice(MAX_RECENT_BOOKS)) await database.delete("recent", old.bookKey);
    return true;
  } catch {
    return false;
  }
}

export async function listRecent(): Promise<RecentRecord[]> {
  try {
    return (await (await db()).getAll("recent"))
      .map((r) => parseKeyed(r, "openedAt"))
      .filter((r): r is RecentRecord => r !== null)
      .sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

// ---------- imported files (R4) ----------

const IMPORT_ID = /^[a-f0-9-]{36}$/;

export function parseImport(raw: unknown): ImportRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !IMPORT_ID.test(r.id)) return null;
  if (r.format !== "epub" && r.format !== "pdf") return null;
  if (typeof r.size !== "number" || !Number.isInteger(r.size) || r.size <= 0) return null;
  const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : fallback);
  const name = text(r.name, "Untitled");
  return {
    id: r.id,
    format: r.format,
    name,
    title: text(r.title, name),
    size: r.size,
    addedAt: finite(r.addedAt),
    openedAt: typeof r.openedAt === "number" && Number.isFinite(r.openedAt) ? r.openedAt : null,
  };
}

/** Imported books, most recently opened (or added) first. */
export async function listImports(): Promise<ImportRecord[]> {
  try {
    const all = await (await db()).getAll("imports");
    return all
      .map(parseImport)
      .filter((r): r is ImportRecord => r !== null)
      .sort((a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt));
  } catch {
    return [];
  }
}

export async function getImport(id: string): Promise<ImportRecord | null> {
  if (!IMPORT_ID.test(id)) return null;
  try {
    return parseImport(await (await db()).get("imports", id));
  } catch {
    return null;
  }
}

/** The book's bytes (a fresh copy on every call), or null if missing. */
export async function getImportBytes(id: string): Promise<ArrayBuffer | null> {
  if (!IMPORT_ID.test(id)) return null;
  try {
    const rec = await (await db()).get("importFiles", id);
    return rec?.data instanceof ArrayBuffer && rec.data.byteLength > 0 ? rec.data : null;
  } catch {
    return null;
  }
}

/** Stores a file. Throws the browser's error (e.g. QuotaExceededError) so the caller can explain it. */
export async function addImport(file: Blob, name: string, format: ImportRecord["format"]): Promise<ImportRecord> {
  const data = await file.arrayBuffer();
  const record: ImportRecord = {
    id: crypto.randomUUID(),
    format,
    name: name.slice(0, 200) || "Untitled",
    title: (name.replace(/\.(epub|pdf)$/i, "") || "Untitled").slice(0, 200),
    size: data.byteLength,
    addedAt: Date.now(),
    openedAt: null,
  };
  const tx = (await db()).transaction(["imports", "importFiles"], "readwrite");
  await Promise.all([tx.objectStore("importFiles").put({ id: record.id, data }), tx.objectStore("imports").put(record), tx.done]);
  return record;
}

/** Updates title and/or opened time. Returns false if it couldn't be saved. */
export async function updateImport(id: string, patch: { title?: string; openedAt?: number }): Promise<boolean> {
  try {
    const database = await db();
    const tx = database.transaction("imports", "readwrite");
    const current = parseImport(await tx.store.get(id));
    if (!current) return false;
    const title = patch.title?.trim().slice(0, 200);
    await tx.store.put({ ...current, ...(title ? { title } : {}), ...(patch.openedAt ? { openedAt: patch.openedAt } : {}) });
    await tx.done;
    return true;
  } catch {
    return false;
  }
}

/** Deletes the file and everything saved about it (progress, bookmarks, favourite, recent) in one step. */
export async function deleteImport(id: string): Promise<boolean> {
  if (!IMPORT_ID.test(id)) return false;
  const key = importKey(id);
  try {
    const database = await db();
    const tx = database.transaction(["imports", "importFiles", "progress", "bookmarks", "favourites", "recent"], "readwrite");
    const bookmarkIds = await tx.objectStore("bookmarks").index("byBook").getAllKeys(key);
    await Promise.all([
      tx.objectStore("imports").delete(id),
      tx.objectStore("importFiles").delete(id),
      tx.objectStore("progress").delete(key),
      tx.objectStore("favourites").delete(key),
      tx.objectStore("recent").delete(key),
      ...bookmarkIds.map((b) => tx.objectStore("bookmarks").delete(b)),
    ]);
    await tx.done;
    return true;
  } catch {
    return false;
  }
}
