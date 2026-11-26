import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/lib/storage/local";
import {
  addBookmark,
  addImport,
  getImportBytes,
  getProgress,
  isFavourite,
  listBookmarks,
  listImports,
  resetReadingDbConnection,
  saveProgress,
  setFavourite,
} from "@/features/reading/storage/readingDb";
import { BACKUP_VERSION, createBackupParts, describeApp, parseBackup, type BackupApps } from "./backup";
import { clearAppData, collectBackup, restoreBackup, storageUsage } from "./localData";
import { DATA_APPS } from "./registry";

/** A localStorage stand-in (vitest runs in node). `failOn` makes writes to one key run out of space. */
class FakeStorage {
  map = new Map<string, string>();
  failOn: string | null = null;
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => {
    if (k === this.failOn) throw new DOMException("full", "QuotaExceededError");
    this.map.set(k, String(v));
  };
  removeItem = (k: string) => void this.map.delete(k);
}

let ls: FakeStorage;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetReadingDbConnection();
  ls = new FakeStorage();
  vi.stubGlobal("window", { localStorage: ls });
});
afterEach(() => vi.unstubAllGlobals());

const EPUB = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]);
const PDF = new TextEncoder().encode("%PDF-1.7 a small test pdf");
const join = (parts: string[]) => parts.join("");

/** Representative data in every app, as a real user would have after a while. */
async function seed() {
  ls.setItem(STORAGE_KEYS.radioFavourites, JSON.stringify([{ id: "s1", name: "Vividh Bharati" }]));
  ls.setItem(STORAGE_KEYS.radioPresets, JSON.stringify({ slots: ["s1", null] }));
  ls.setItem(STORAGE_KEYS.desktopPrefs, JSON.stringify({ wallpaper: "dusk", theme: "olive", userName: "Asha" }));
  ls.setItem(STORAGE_KEYS.notepad, JSON.stringify({ text: "Shopping: Parle-G", wrap: true }));
  ls.setItem(STORAGE_KEYS.gamesBest, JSON.stringify({ saanp: 42 }));
  ls.setItem(STORAGE_KEYS.introSeen, "not json at all"); // an old leftover that isn't JSON
  ls.setItem("someone-else.key", "1"); // not XPLOR9's
  const epub = await addImport(new Blob([EPUB]), "My book.epub", "epub");
  const pdf = await addImport(new Blob([PDF]), "Notes.pdf", "pdf");
  await saveProgress({ bookKey: "cat:pg-1342", cfi: "epubcfi(/6/4!/4/2)", fraction: 0.4, chapter: "Chapter 3", updatedAt: 1 });
  await saveProgress({ bookKey: `local:${pdf.id}`, cfi: "pdf:page=12", fraction: 0.2, chapter: null, updatedAt: 2 });
  await addBookmark({ bookKey: "cat:pg-1342", cfi: "epubcfi(/6/4!/4/2/1:0)", chapter: "Chapter 3", excerpt: "It is a truth", fraction: 0.4 });
  await setFavourite(`local:${epub.id}`, true);
  return { epub, pdf };
}

async function backupText(includeBooks = true) {
  const { apps, files } = await collectBackup(includeBooks);
  return join(await createBackupParts(apps, files, new Date("2026-11-27T10:00:00Z")));
}

describe("registry", () => {
  it("gives every stored setting to exactly one app", () => {
    const owned = DATA_APPS.flatMap((a) => a.keys);
    expect(new Set(owned).size).toBe(owned.length);
    expect(owned.sort()).toEqual(Object.values(STORAGE_KEYS).sort());
  });
});

describe("backing up and restoring", () => {
  it("restores everything exactly, imported books included, into an empty browser", async () => {
    const { epub, pdf } = await seed();
    const text = await backupText();
    const parsed = await parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.apps.radio?.settings[STORAGE_KEYS.radioFavourites]).toContain("Vividh Bharati");
    expect(parsed.backup.apps.desktop?.settings[STORAGE_KEYS.introSeen]).toBeUndefined(); // not JSON: left out
    expect(text).not.toContain("someone-else");
    expect(describeApp(parsed.backup.apps.reading!)).toBe("2 books with progress, 1 bookmark, 1 favourite book, 2 imported books");

    // A new browser: nothing saved.
    const before = new Map(ls.map);
    globalThis.indexedDB = new IDBFactory();
    resetReadingDbConnection();
    ls.map.clear();
    await restoreBackup(parsed.backup, DATA_APPS.map((a) => a.id));
    for (const [k, v] of before) if (k.startsWith("xplor9.") && k !== STORAGE_KEYS.introSeen) expect(ls.getItem(k)).toBe(v);
    expect((await listImports()).map((r) => r.id).sort()).toEqual([epub.id, pdf.id].sort());
    expect(new Uint8Array((await getImportBytes(pdf.id))!)).toEqual(PDF);
    expect((await getProgress(`local:${pdf.id}`))?.cfi).toBe("pdf:page=12");
    expect(await listBookmarks("cat:pg-1342")).toHaveLength(1);
    expect(await isFavourite(`local:${epub.id}`)).toBe(true);
  });

  it("restoring the same backup twice gives the same result (no duplicate books or bookmarks)", async () => {
    await seed();
    const parsed = await parseBackup(await backupText());
    if (!parsed.ok) throw new Error("bad");
    await restoreBackup(parsed.backup, ["reading"]);
    await restoreBackup(parsed.backup, ["reading"]);
    expect(await listImports()).toHaveLength(2);
    expect(await listBookmarks("cat:pg-1342")).toHaveLength(1);
  });

  it("restores only the ticked apps and replaces them; the rest are left as they are", async () => {
    await seed();
    const parsed = await parseBackup(await backupText());
    if (!parsed.ok) throw new Error("bad");
    ls.setItem(STORAGE_KEYS.notepad, JSON.stringify({ text: "today's note", wrap: true }));
    ls.setItem(STORAGE_KEYS.radioRecents, JSON.stringify([{ id: "new" }])); // not in the backup
    await restoreBackup(parsed.backup, ["radio"]);
    expect(ls.getItem(STORAGE_KEYS.radioRecents)).toBeNull(); // replaced: the backup had none
    expect(ls.getItem(STORAGE_KEYS.notepad)).toContain("today's note"); // not ticked
  });

  it("a backup without imported books keeps the books already here", async () => {
    const { epub } = await seed();
    const parsed = await parseBackup(await backupText(false));
    if (!parsed.ok) throw new Error("bad");
    expect(parsed.backup.apps.reading?.reading?.includesBooks).toBe(false);
    await restoreBackup(parsed.backup, ["reading"]);
    expect((await listImports()).map((r) => r.id)).toContain(epub.id);
  });

  it("if the browser runs out of space part-way, nothing is changed", async () => {
    await seed();
    const parsed = await parseBackup(await backupText());
    if (!parsed.ok) throw new Error("bad");
    ls.setItem(STORAGE_KEYS.radioFavourites, JSON.stringify([{ id: "current" }]));
    const snapshot = new Map(ls.map);
    ls.failOn = STORAGE_KEYS.notepad; // written after the radio's settings
    await expect(restoreBackup(parsed.backup, ["radio", "notepad"])).rejects.toThrow(/Nothing was changed/);
    expect(ls.map).toEqual(snapshot);
  });

  it("if the Reading Room can't be written, the settings already restored are put back", async () => {
    await seed();
    const parsed = await parseBackup(await backupText());
    if (!parsed.ok) throw new Error("bad");
    ls.setItem(STORAGE_KEYS.readerSettings, JSON.stringify({ theme: "sepia" }));
    const snapshot = new Map(ls.map);
    // A broken database: every transaction fails.
    globalThis.indexedDB = { open: () => { throw new DOMException("blocked", "InvalidStateError"); } } as unknown as IDBFactory;
    resetReadingDbConnection();
    await expect(restoreBackup(parsed.backup, ["reading"])).rejects.toThrow(/Nothing was changed/);
    expect(ls.map).toEqual(snapshot);
  });
});

describe("refusing bad backup files", () => {
  it("a file cut short (incomplete download)", async () => {
    await seed();
    const text = await backupText();
    expect(await parseBackup(text.slice(0, Math.floor(text.length * 0.7)))).toEqual({ ok: false, error: "not-json" });
  });

  it("a file that isn't a backup", async () => {
    expect(await parseBackup("hello")).toEqual({ ok: false, error: "not-json" });
    expect(await parseBackup(JSON.stringify({ name: "a playlist" }))).toEqual({ ok: false, error: "not-backup" });
    expect(await parseBackup("[]")).toEqual({ ok: false, error: "not-backup" });
  });

  it("a backup from a newer version", async () => {
    const doc = JSON.parse(await backupText());
    doc.version = BACKUP_VERSION + 1;
    expect(await parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: "newer-version" });
  });

  it("a backup edited or damaged after it was made", async () => {
    await seed();
    const text = await backupText();
    expect(await parseBackup(text.replace("Vividh Bharati", "Vividh Bharatx"))).toEqual({ ok: false, error: "damaged" });
    const doc = JSON.parse(text);
    doc.checksum = "sha256:" + "0".repeat(64);
    expect(await parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: "damaged" });
  });

  it("an imported book whose bytes are missing, damaged or not a book", async () => {
    const { pdf } = await seed();
    const doc = JSON.parse(await backupText());
    const good = doc.files[pdf.id];
    delete doc.files[pdf.id];
    expect(await parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: "damaged" });
    doc.files[pdf.id] = good.slice(0, -4) + "AAAA";
    expect(await parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: "damaged" });
    doc.files[pdf.id] = "!!not base64!!";
    expect(await parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: "damaged" });
  });

  it("an imported book over the import size limit", async () => {
    const { epub } = await seed();
    const { apps, files } = await collectBackup(true);
    const imports = apps.reading!.reading!.records.imports;
    imports.find((r) => r.id === epub.id)!.size = 101 * 1024 * 1024;
    expect(await parseBackup(join(await createBackupParts(apps, files)))).toEqual({ ok: false, error: "damaged" });
  });

  it("invalid or duplicated records (even with a matching checksum)", async () => {
    const make = async (apps: BackupApps) => join(await createBackupParts(apps, new Map()));
    const records = { progress: [], bookmarks: [], favourites: [], recent: [], imports: [] };
    const dup = { bookKey: "cat:pg-1", addedAt: 1 };
    expect(await parseBackup(await make({ reading: { settings: {}, reading: { records: { ...records, favourites: [dup, dup] }, includesBooks: false } } }))).toEqual({
      ok: false,
      error: "damaged",
    });
    const bad = { bookKey: "javascript:alert(1)", addedAt: 1 };
    expect(await parseBackup(await make({ reading: { settings: {}, reading: { records: { ...records, favourites: [bad] }, includesBooks: false } } }))).toEqual({
      ok: false,
      error: "damaged",
    });
    expect(await parseBackup(await make({ radio: { settings: { [STORAGE_KEYS.radioPrefs]: "{oops" } } }))).toEqual({ ok: false, error: "damaged" });
  });

  it("settings and apps from another version are left out, not restored", async () => {
    const apps = { radio: { settings: { [STORAGE_KEYS.radioPrefs]: "{}", "xplor9.radio.future": "1" } }, holodeck: { settings: {} } } as unknown as BackupApps;
    const parsed = await parseBackup(join(await createBackupParts(apps, new Map())));
    expect(parsed.ok && parsed.backup.skipped).toBe(2);
    expect(parsed.ok && Object.keys(parsed.backup.apps.radio!.settings)).toEqual([STORAGE_KEYS.radioPrefs]);
  });

  it("a backup with nothing in it", async () => {
    expect(await parseBackup(join(await createBackupParts({}, new Map())))).toEqual({ ok: false, error: "empty" });
  });
});

describe("storage used and clearing", () => {
  it("measures each app and clears one app, or everything", async () => {
    await seed();
    const usage = await storageUsage();
    const of = (id: string) => usage.find((u) => u.id === id)!;
    expect(of("reading")).toMatchObject({ books: 2, bookBytes: EPUB.byteLength + PDF.byteLength });
    expect(of("tv").bytes).toBe(0);
    expect(of("radio").bytes).toBeGreaterThan(0);

    await clearAppData(["radio"]);
    expect(ls.getItem(STORAGE_KEYS.radioFavourites)).toBeNull();
    expect(ls.getItem(STORAGE_KEYS.notepad)).not.toBeNull();
    expect(await listImports()).toHaveLength(2);

    await clearAppData(DATA_APPS.map((a) => a.id));
    expect([...ls.map.keys()]).toEqual(["someone-else.key"]); // only XPLOR9's own data is removed
    expect(await listImports()).toHaveLength(0);
    expect(await getProgress("cat:pg-1342")).toBeNull();
  });
});
