import {
  parseBookmark,
  parseFavourite,
  parseImport,
  parseProgress,
  parseRecent,
  type ReadingRecords,
} from "@/features/reading/storage/readingDb";
import { EPUB_LIMITS, PDF_LIMITS } from "@/features/imports/limits";
import { DATA_APPS, isDataAppId, type DataAppId } from "./registry";

/**
 * The XPLOR9 backup file: one JSON file holding everything XPLOR9 keeps in this browser.
 *
 *   { format: "xplor9-backup", version: 1, createdAt, checksum, apps: { <app>: AppBackup }, files: { <importId>: base64 } }
 *
 * - `checksum` is the SHA-256 of `apps` exactly as written, so a file that was cut short, damaged
 *   or edited is refused instead of half-restored.
 * - Imported books' bytes sit in `files`, outside the checksum (they can be hundreds of MB); each
 *   one is checked against its own SHA-256 in `apps.reading.fileHashes`.
 * - A file is read completely and validated before anything is changed (see restore in localData.ts).
 * - Settings are kept as the exact text stored in the browser; each app validates its own settings
 *   when it reads them (as it does for anything in browser storage).
 */

export const BACKUP_FORMAT = "xplor9-backup";
export const BACKUP_VERSION = 1;
/** Largest backup file accepted (imported books are the bulk of it). */
export const MAX_BACKUP_BYTES = 400 * 1024 * 1024;
/** Largest total of imported books that can go into one backup (base64 makes them a third bigger). */
export const MAX_BACKUP_BOOK_BYTES = 280 * 1024 * 1024;
const MAX_SETTING_CHARS = 1_000_000;
const MAX_RECORDS = 20_000;

export interface ReadingBackup {
  records: ReadingRecords;
  /** False when the backup was made without imported books: restoring it keeps the books already here. */
  includesBooks: boolean;
}

export interface AppBackup {
  /** Browser-storage key → the exact text stored. */
  settings: Record<string, string>;
  reading?: ReadingBackup;
}

export type BackupApps = Partial<Record<DataAppId, AppBackup>>;

export interface BackupContents {
  createdAt: string;
  apps: BackupApps;
  /** Imported books' bytes, by import id (verified). */
  files: Map<string, ArrayBuffer>;
  /** Settings this version of XPLOR9 doesn't know (from another version); they're left out. */
  skipped: number;
}

export type BackupError = "too-large" | "not-json" | "not-backup" | "newer-version" | "damaged" | "empty";

export const BACKUP_ERROR_MESSAGES: Record<BackupError, string> = {
  "too-large": "This file is too large to be an XPLOR9 backup.",
  "not-json": "This file is incomplete or damaged, or it isn't an XPLOR9 backup. If it was still downloading, try again once it has finished.",
  "not-backup": "This isn't an XPLOR9 backup file.",
  "newer-version": "This backup was made by a newer version of XPLOR9 and can't be restored here.",
  damaged: "This backup is damaged or was changed after it was made, so it can't be restored safely. Nothing was changed.",
  empty: "This backup has nothing in it to restore.",
};

export type ParseResult = { ok: true; backup: BackupContents } | { ok: false; error: BackupError };

// ---------- helpers ----------

async function sha256(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(out);
}

function fromBase64(text: string): ArrayBuffer | null {
  try {
    const bin = atob(text);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** EPUBs are ZIP files ("PK\3\4"); PDFs start "%PDF-". */
function looksLike(format: "epub" | "pdf", data: ArrayBuffer): boolean {
  const b = new Uint8Array(data, 0, Math.min(5, data.byteLength));
  return format === "epub" ? b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 : String.fromCharCode(...b) === "%PDF-";
}

// ---------- writing ----------

/**
 * The backup file as text parts (join them, or hand them to a Blob, so large books never have to
 * become one giant string). `files` holds the imported books to include.
 */
export async function createBackupParts(apps: BackupApps, files: Map<string, ArrayBuffer>, now = new Date()): Promise<string[]> {
  const reading = apps.reading?.reading;
  const fileHashes: Record<string, string> = {};
  if (reading?.includesBooks) for (const r of reading.records.imports) fileHashes[r.id] = await sha256(files.get(r.id)!);
  const withHashes: Record<string, unknown> = { ...apps };
  if (apps.reading && reading) withHashes.reading = { ...apps.reading, reading: { ...reading, fileHashes } };
  const appsJson = JSON.stringify(withHashes);
  const head = `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${BACKUP_VERSION},"createdAt":${JSON.stringify(now.toISOString())},"checksum":"sha256:${await sha256(appsJson)}","apps":${appsJson},"files":{`;
  const parts = [head];
  Object.keys(fileHashes).forEach((id, i) => parts.push(`${i ? "," : ""}${JSON.stringify(id)}:"`, toBase64(files.get(id)!), `"`));
  parts.push("}}");
  return parts;
}

export function backupFileName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `xplor9-backup-${d}.json`;
}

// ---------- reading ----------

function parseList<T>(raw: unknown, parse: (r: unknown) => T | null, key: (r: T) => string): T[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_RECORDS) return null;
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const r = parse(item);
    if (!r || seen.has(key(r))) return null; // an invalid or duplicated record: the file isn't trustworthy
    seen.add(key(r));
    out.push(r);
  }
  return out;
}

function parseReading(raw: unknown): (ReadingBackup & { fileHashes: Record<string, string> }) | null {
  if (!isRecord(raw) || !isRecord(raw.records) || typeof raw.includesBooks !== "boolean") return null;
  const r = raw.records;
  const progress = parseList(r.progress, parseProgress, (x) => x.bookKey);
  const bookmarks = parseList(r.bookmarks, parseBookmark, (x) => x.id);
  const favourites = parseList(r.favourites, parseFavourite, (x) => x.bookKey);
  const recent = parseList(r.recent, parseRecent, (x) => x.bookKey);
  const imports = parseList(r.imports, parseImport, (x) => x.id);
  if (!progress || !bookmarks || !favourites || !recent || !imports) return null;
  const hashes = raw.includesBooks ? raw.fileHashes : {};
  if (!isRecord(hashes)) return null;
  const fileHashes: Record<string, string> = {};
  for (const imp of raw.includesBooks ? imports : []) {
    const h = hashes[imp.id];
    if (typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h)) return null;
    fileHashes[imp.id] = h;
  }
  return { records: { progress, bookmarks, favourites, recent, imports: raw.includesBooks ? imports : [] }, includesBooks: raw.includesBooks, fileHashes };
}

/** Reads and fully validates a backup file's text. Nothing is changed by reading. */
export async function parseBackup(text: string): Promise<ParseResult> {
  if (text.length > MAX_BACKUP_BYTES * 1.1) return { ok: false, error: "too-large" };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: "not-json" };
  }
  if (!isRecord(doc) || doc.format !== BACKUP_FORMAT) return { ok: false, error: "not-backup" };
  if (typeof doc.version !== "number" || !Number.isInteger(doc.version) || doc.version < 1) return { ok: false, error: "damaged" };
  if (doc.version > BACKUP_VERSION) return { ok: false, error: "newer-version" };
  if (!isRecord(doc.apps) || typeof doc.checksum !== "string" || typeof doc.createdAt !== "string" || Number.isNaN(Date.parse(doc.createdAt))) {
    return { ok: false, error: "damaged" };
  }
  // JSON.stringify of parsed JSON gives back exactly what createBackupParts wrote.
  if (doc.checksum !== `sha256:${await sha256(JSON.stringify(doc.apps))}`) return { ok: false, error: "damaged" };

  const apps: BackupApps = {};
  let skipped = 0;
  let fileHashes: Record<string, string> = {};
  for (const [id, raw] of Object.entries(doc.apps)) {
    if (!isDataAppId(id)) {
      skipped++; // an app from another version
      continue;
    }
    if (!isRecord(raw) || !isRecord(raw.settings)) return { ok: false, error: "damaged" };
    const known = DATA_APPS.find((a) => a.id === id)!.keys;
    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.settings)) {
      if (typeof value !== "string" || value.length > MAX_SETTING_CHARS) return { ok: false, error: "damaged" };
      try {
        JSON.parse(value);
      } catch {
        return { ok: false, error: "damaged" };
      }
      if (known.includes(key)) settings[key] = value;
      else skipped++;
    }
    const entry: AppBackup = { settings };
    if (id === "reading" && raw.reading !== undefined) {
      const reading = parseReading(raw.reading);
      if (!reading) return { ok: false, error: "damaged" };
      fileHashes = reading.fileHashes;
      entry.reading = { records: reading.records, includesBooks: reading.includesBooks };
    }
    apps[id] = entry;
  }
  if (Object.keys(apps).length === 0) return { ok: false, error: "empty" };

  // Imported books: every one listed must be present, intact and really an EPUB or PDF.
  const files = new Map<string, ArrayBuffer>();
  if (!isRecord(doc.files)) return { ok: false, error: "damaged" };
  for (const imp of apps.reading?.reading?.records.imports ?? []) {
    // The same size limits as importing the file directly.
    if (imp.size > (imp.format === "epub" ? EPUB_LIMITS.maxFileBytes : PDF_LIMITS.maxFileBytes)) return { ok: false, error: "damaged" };
    const b64 = doc.files[imp.id];
    const data = typeof b64 === "string" ? fromBase64(b64) : null;
    if (!data || data.byteLength !== imp.size || !looksLike(imp.format, data) || (await sha256(data)) !== fileHashes[imp.id]) {
      return { ok: false, error: "damaged" };
    }
    files.set(imp.id, data);
  }
  return { ok: true, backup: { createdAt: doc.createdAt, apps, files, skipped } };
}

/** What a backup holds for one app, in a few words (for the restore screen). */
export function describeApp(app: AppBackup): string {
  const settings = Object.keys(app.settings).length;
  const parts: string[] = [];
  if (settings) parts.push(`${settings} ${settings === 1 ? "setting" : "settings"}`);
  const r = app.reading?.records;
  if (r) {
    const n = (count: number, one: string, many: string) => count && parts.push(`${count} ${count === 1 ? one : many}`);
    n(r.progress.length, "book with progress", "books with progress");
    n(r.bookmarks.length, "bookmark", "bookmarks");
    n(r.favourites.length, "favourite book", "favourite books");
    n(r.imports.length, "imported book", "imported books");
  }
  return parts.length ? parts.join(", ") : "nothing saved";
}
