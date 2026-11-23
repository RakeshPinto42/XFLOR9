import "fake-indexeddb/auto"; // installs IDBRequest, IDBKeyRange, ... as globals
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_RECENT_BOOKS,
  addBookmark,
  deleteBookmark,
  getProgress,
  isFavourite,
  listBookmarks,
  listFavourites,
  listRecent,
  parseBookmark,
  recordOpened,
  resetReadingDbConnection,
  saveProgress,
  setFavourite,
  tidyExcerpt,
} from "./readingDb";

// A real IndexedDB implementation, fresh for every test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetReadingDbConnection();
});

const cfi = (n: number) => `epubcfi(/6/${n}!/4/2/1:0)`;

describe("upgrade from R2 (version 1) to version 2", () => {
  it("keeps reading progress saved before the upgrade", async () => {
    const v1 = await openDB("xplor9-reading", 1, {
      upgrade: (d) => d.createObjectStore("progress", { keyPath: "bookKey" }),
    });
    await v1.put("progress", { bookKey: "cat:the-time-machine", cfi: cfi(16), fraction: 0.36, chapter: "VII", updatedAt: 5 });
    v1.close();

    expect(await getProgress("cat:the-time-machine")).toMatchObject({ fraction: 0.36, chapter: "VII" });
    expect(await listBookmarks("cat:the-time-machine")).toEqual([]); // new stores exist and are empty
  });
});

describe("bookmarks", () => {
  it("adds, lists in reading order and deletes", async () => {
    const late = await addBookmark({ bookKey: "cat:b", cfi: cfi(20), chapter: "X", excerpt: "later", fraction: 0.8 });
    const early = await addBookmark({ bookKey: "cat:b", cfi: cfi(4), chapter: "I", excerpt: "earlier", fraction: 0.1 });
    await addBookmark({ bookKey: "cat:other", cfi: cfi(4), chapter: null, excerpt: "", fraction: 0.5 });
    expect((await listBookmarks("cat:b")).map((b) => b.excerpt)).toEqual(["earlier", "later"]);
    expect(await deleteBookmark(early!.id)).toBe(true);
    expect((await listBookmarks("cat:b")).map((b) => b.id)).toEqual([late!.id]);
  });

  it("rejects invalid input instead of storing it", async () => {
    expect(await addBookmark({ bookKey: "cat:b", cfi: "javascript:alert(1)", chapter: null, excerpt: "", fraction: 0 })).toBeNull();
    expect(await addBookmark({ bookKey: "bad key", cfi: cfi(1), chapter: null, excerpt: "", fraction: 0 })).toBeNull();
  });

  it("validates records read back from storage", () => {
    expect(parseBookmark({ id: "short", bookKey: "cat:b", cfi: cfi(1) })).toBeNull();
    expect(parseBookmark({ id: "abcdefgh-1234", bookKey: "cat:b", cfi: cfi(1), fraction: 9 })?.fraction).toBe(1);
  });
});

describe("favourites", () => {
  it("adds and removes, newest first", async () => {
    await setFavourite("cat:a", true);
    await new Promise((r) => setTimeout(r, 2));
    await setFavourite("cat:b", true);
    expect((await listFavourites()).map((f) => f.bookKey)).toEqual(["cat:b", "cat:a"]);
    expect(await isFavourite("cat:a")).toBe(true);
    expect(await setFavourite("cat:a", false)).toBe(false);
    expect(await isFavourite("cat:a")).toBe(false);
  });

  it("refuses invalid book keys", async () => {
    expect(await setFavourite("<script>", true)).toBeNull();
  });
});

describe("recently opened", () => {
  it("moves a reopened book to the top without duplicates", async () => {
    await recordOpened("cat:a");
    await new Promise((r) => setTimeout(r, 2));
    await recordOpened("cat:b");
    await new Promise((r) => setTimeout(r, 2));
    await recordOpened("cat:a");
    expect((await listRecent()).map((r) => r.bookKey)).toEqual(["cat:a", "cat:b"]);
  });

  it(`keeps only the newest ${MAX_RECENT_BOOKS}`, async () => {
    for (let i = 0; i <= MAX_RECENT_BOOKS; i++) {
      await recordOpened(`cat:book-${i}`);
      await new Promise((r) => setTimeout(r, 1));
    }
    const recent = await listRecent();
    expect(recent).toHaveLength(MAX_RECENT_BOOKS);
    expect(recent.some((r) => r.bookKey === "cat:book-0")).toBe(false);
  });
});

describe("progress still works on version 2", () => {
  it("saves and reads progress", async () => {
    expect(await saveProgress({ bookKey: "cat:x", cfi: cfi(2), fraction: 0.2, chapter: null, updatedAt: 1 })).toBe(true);
    expect((await getProgress("cat:x"))?.fraction).toBe(0.2);
  });
});

describe("tidyExcerpt", () => {
  it("collapses whitespace and shortens long text", () => {
    expect(tidyExcerpt("  The   Time\nTraveller  ")).toBe("The Time Traveller");
    expect(tidyExcerpt("a".repeat(200), 10)).toBe("aaaaaaaaa…");
  });
});
