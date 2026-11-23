import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../../content/books/catalogue.json";
import { CatalogueError, filterBooks, parseCatalogue, type Book } from "./catalogue";

const books = parseCatalogue(raw);
const clone = (): { version: number; books: Book[] } => JSON.parse(JSON.stringify(raw));
const problemsOf = (mutate: (b: Book) => void) => {
  const c = clone();
  mutate(c.books[0]);
  try {
    parseCatalogue(c);
    return [];
  } catch (e) {
    return (e as CatalogueError).problems;
  }
};

describe("the real catalogue", () => {
  it("has at least five valid, uniquely identified books", () => {
    expect(books.length).toBeGreaterThanOrEqual(5);
    expect(new Set(books.map((b) => b.id)).size).toBe(books.length);
  });

  it.each(books.map((b) => [b.id, b]))("%s: the file on disk matches its record", (_, b) => {
    const path = join(process.cwd(), "public", (b as Book).file.path);
    const bytes = readFileSync(path);
    expect(statSync(path).size).toBe((b as Book).file.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe((b as Book).file.sha256);
    expect(bytes.subarray(0, 2).toString()).toBe("PK"); // a ZIP container
    expect(bytes.subarray(30, 38).toString()).toBe("mimetype"); // EPUB: mimetype entry first
  });

  it("content notes are present where decided", () => {
    const note = (id: string) => books.find((b) => b.id === id)?.contentNote;
    expect(note("the-time-machine")).toMatch(/offensive racial language/);
    expect(note("vikram-and-the-vampire")).toMatch(/colonial/);
  });
});

describe("rights rules", () => {
  it("rejects a contributor still in copyright in India", () => {
    expect(problemsOf((b) => (b.rights.contributors[0].died = 1966))).toEqual(
      expect.arrayContaining([expect.stringMatching(/still in copyright in India in 2026/)]),
    );
  });

  it("accepts the boundary year: died 1965 is public domain in India from 2026", () => {
    expect(problemsOf((b) => (b.rights.contributors[0].died = 1965))).toEqual([]);
  });

  it("ignores contributors whose work is not in the file", () => {
    expect(
      problemsOf((b) =>
        b.rights.contributors.push({ name: "Later Illustrator", role: "illustrator", born: 1900, died: 1990, inFile: false }),
      ),
    ).toEqual([]);
  });

  it("flags a modern translator even when the author is public domain", () => {
    expect(
      problemsOf((b) =>
        b.rights.contributors.push({ name: "Modern Translator", role: "translator", born: 1950, died: 2010, inFile: true }),
      ),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/Modern Translator .* still in copyright/)]));
  });

  it("rejects works first published in 1931 or later (US)", () => {
    expect(problemsOf((b) => (b.firstPublished.year = 1931))).toEqual(
      expect.arrayContaining([expect.stringMatching(/\(US\)/)]),
    );
  });

  it("requires evidence, a full source hash and an author contributor", () => {
    expect(problemsOf((b) => (b.rights.evidence = b.rights.evidence.slice(0, 1)))).toEqual(
      expect.arrayContaining([expect.stringMatching(/two pieces of evidence/)]),
    );
    expect(problemsOf((b) => (b.rights.source.originalSha256 = "abc"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/originalSha256/)]),
    );
    expect(problemsOf((b) => (b.authors = ["Someone Else"]))).toEqual(
      expect.arrayContaining([expect.stringMatching(/no contributor record/)]),
    );
  });

  it("rejects duplicate ids, unknown genres and non-EPUB paths", () => {
    const c = clone();
    c.books[1].id = c.books[0].id;
    expect(() => parseCatalogue(c)).toThrow(/duplicate id/);
    expect(problemsOf((b) => ((b.genres as string[]) = ["romance"]))).toHaveLength(1);
    expect(problemsOf((b) => (b.file.path = "/books/x.pdf"))).toHaveLength(1);
  });
});

describe("filterBooks", () => {
  const none = { q: "", language: null, genre: null } as const;

  it("searches title and author, ignoring case and accents", () => {
    expect(filterBooks(books, { ...none, q: "SHERLOCK" }).map((b) => b.id)).toEqual(["adventures-of-sherlock-holmes"]);
    expect(filterBooks(books, { ...none, q: "kipling" }).map((b) => b.id).sort()).toEqual([
      "just-so-stories",
      "kim",
      "the-jungle-book",
      "the-second-jungle-book",
    ]);
    expect(filterBooks(books, { ...none, q: "  wélls " }).map((b) => b.id)).toEqual(["the-time-machine"]);
    expect(filterBooks(books, { ...none, q: "tagore" }).map((b) => b.id).sort()).toEqual(["gitanjali", "the-crescent-moon"]);
  });

  it("combines search with language and genre", () => {
    expect(filterBooks(books, { ...none, genre: "poetry" }).map((b) => b.id).sort()).toEqual([
      "ancient-ballads-and-legends-of-hindustan",
      "gitanjali",
      "the-crescent-moon",
      "the-golden-threshold",
    ]);
    expect(filterBooks(books, { q: "steel", language: "en", genre: "folklore" }).map((b) => b.id)).toEqual(["tales-of-the-punjab"]);
    expect(filterBooks(books, { q: "island", language: "en", genre: "mystery" })).toEqual([]);
  });
});
