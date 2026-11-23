import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addBookmark,
  addImport,
  deleteImport,
  getImport,
  getImportBytes,
  getProgress,
  importKey,
  isFavourite,
  listBookmarks,
  listImports,
  listRecent,
  parseImport,
  recordOpened,
  resetReadingDbConnection,
  saveProgress,
  setFavourite,
  updateImport,
} from "./readingDb";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetReadingDbConnection();
});

const ZIP_HEAD = String.fromCharCode(0x50, 0x4b, 0x03, 0x04);
const file = (text = `${ZIP_HEAD}book`) => new Blob([text], { type: "application/epub+zip" });

describe("upgrade from R3 (version 2) to version 3", () => {
  it("keeps progress saved before the upgrade", async () => {
    const v2 = await openDB("xplor9-reading", 2, {
      upgrade(d) {
        d.createObjectStore("progress", { keyPath: "bookKey" });
        d.createObjectStore("bookmarks", { keyPath: "id" }).createIndex("byBook", "bookKey");
        d.createObjectStore("favourites", { keyPath: "bookKey" });
        d.createObjectStore("recent", { keyPath: "bookKey" });
      },
    });
    await v2.put("progress", { bookKey: "cat:b", cfi: "epubcfi(/6/4!/4)", fraction: 0.4, chapter: null, updatedAt: 1 });
    v2.close();
    expect(await getProgress("cat:b")).toMatchObject({ fraction: 0.4 });
    expect(await listImports()).toEqual([]);
  });
});

describe("imported files", () => {
  it("stores details and bytes separately; renames and records opening", async () => {
    const rec = await addImport(file(), "My Book.epub", "epub");
    expect(rec.title).toBe("My Book");
    expect(rec.size).toBe(8);
    expect((await listImports()).map((r) => r.id)).toEqual([rec.id]);
    // Listing returns details only, never the bytes.
    expect(Object.keys((await listImports())[0])).not.toContain("data");
    expect(new TextDecoder().decode((await getImportBytes(rec.id))!)).toBe(`${ZIP_HEAD}book`);
    expect(await updateImport(rec.id, { title: "  The Real Title  ", openedAt: 42 })).toBe(true);
    expect(await getImport(rec.id)).toMatchObject({ title: "The Real Title", openedAt: 42, name: "My Book.epub", format: "epub" });
  });

  it("keeps a name with a dot but no book extension intact", async () => {
    expect((await addImport(file(), "notes.v2.epub", "epub")).title).toBe("notes.v2");
    expect((await addImport(file(), "xepub", "epub")).title).toBe("xepub");
  });

  it("saves PDF page positions only for imported books", async () => {
    const rec = await addImport(file("%PDF-1.7"), "a.pdf", "pdf");
    const base = { fraction: 0.2, chapter: null, updatedAt: 1 };
    expect(await saveProgress({ bookKey: importKey(rec.id), cfi: "pdf:page=7", ...base })).toBe(true);
    expect((await getProgress(importKey(rec.id)))?.cfi).toBe("pdf:page=7");
    expect(await saveProgress({ bookKey: importKey(rec.id), cfi: "pdf:page=1234", ...base })).toBe(true); // multi-digit pages
    expect(await saveProgress({ bookKey: "cat:x", cfi: "pdf:page=7", ...base })).toBe(false);
    expect(await saveProgress({ bookKey: importKey(rec.id), cfi: "pdf:page=0", ...base })).toBe(false);
  });

  it("delete removes the file and everything saved about it, and nothing else", async () => {
    const a = await addImport(file(), "a.epub", "epub");
    const b = await addImport(file(), "b.epub", "epub");
    for (const r of [a, b]) {
      await saveProgress({ bookKey: importKey(r.id), cfi: "epubcfi(/6/4!/4)", fraction: 0.3, chapter: null, updatedAt: 1 });
      await addBookmark({ bookKey: importKey(r.id), cfi: "epubcfi(/6/4!/4)", chapter: null, excerpt: "", fraction: 0.3 });
      await setFavourite(importKey(r.id), true);
      await recordOpened(importKey(r.id));
    }
    expect(await deleteImport(a.id)).toBe(true);
    expect(await getImport(a.id)).toBeNull();
    expect(await getImportBytes(a.id)).toBeNull();
    expect(await getProgress(importKey(a.id))).toBeNull();
    expect(await listBookmarks(importKey(a.id))).toEqual([]);
    expect(await isFavourite(importKey(a.id))).toBe(false);
    expect((await listRecent()).map((r) => r.bookKey)).toEqual([importKey(b.id)]);
    // b untouched
    expect(await getImport(b.id)).not.toBeNull();
    expect(await getImportBytes(b.id)).not.toBeNull();
    expect(await getProgress(importKey(b.id))).not.toBeNull();
    expect(await listBookmarks(importKey(b.id))).toHaveLength(1);
  });

  it("rejects malformed stored records and ids", async () => {
    expect(parseImport({ id: "x", format: "epub", size: 5 })).toBeNull();
    expect(parseImport({ id: crypto.randomUUID(), format: "exe", size: 5 })).toBeNull();
    expect(parseImport({ id: crypto.randomUUID(), format: "pdf", size: -1 })).toBeNull();
    await expect(getImport("../../etc")).resolves.toBeNull();
    await expect(getImportBytes("../../etc")).resolves.toBeNull();
  });
});
