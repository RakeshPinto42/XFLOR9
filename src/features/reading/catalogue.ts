/**
 * The Reading Room catalogue: types and validation.
 *
 * Every book must carry a rights record. Validation enforces the screening rules
 * agreed for XPLOR9 (they are a screen, not legal advice; the evidence links are
 * the real verification):
 *   - India (Copyright Act 1957, s.22): every contributor whose work is in the file
 *     must have died more than 60 full calendar years before the verification year.
 *   - US: first published more than 95 years before the verification year
 *     (i.e. before 1931 when verified in 2026).
 * Rules are checked against the record's own verification date, so the result
 * doesn't depend on when the site happens to be built.
 */

export const GENRES = {
  adventure: "Adventure",
  mystery: "Mystery",
  "science-fiction": "Science fiction",
  horror: "Horror",
  fantasy: "Fantasy",
  folklore: "Folklore",
  children: "Children's",
  classics: "Classics",
} as const;
export type Genre = keyof typeof GENRES;

export const LANGUAGES = { en: "English", hi: "Hindi", kn: "Kannada" } as const;
export type LanguageCode = keyof typeof LANGUAGES;

export type ContributorRole = "author" | "translator" | "editor" | "illustrator";

export interface Contributor {
  name: string;
  role: ContributorRole;
  born: number | null;
  died: number;
  /** Whether their work is actually present in our file. */
  inFile: boolean;
  note?: string;
}

export interface Book {
  id: string;
  title: string;
  authors: string[];
  language: LanguageCode;
  genres: Genre[];
  firstPublished: { year: number; detail: string };
  description: string;
  contentNote: string | null;
  file: { path: string; format: "epub"; bytes: number; sha256: string };
  rights: {
    india: { status: "public-domain"; basis: string };
    us: { status: "public-domain"; basis: string };
    contributors: Contributor[];
    edition: string;
    source: {
      name: string;
      ebookNumber?: number;
      url: string;
      retrievedFrom: string;
      retrievedAt: string;
      originalSha256: string;
    };
    modifications: string[];
    evidence: { claim: string; source: string }[];
    verifiedAt: string; // YYYY-MM-DD
  };
}

export class CatalogueError extends Error {
  constructor(readonly problems: string[]) {
    super(`Reading Room catalogue is invalid:\n- ${problems.join("\n- ")}`);
    this.name = "CatalogueError";
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Parses and validates catalogue JSON. Throws CatalogueError listing every problem found. */
export function parseCatalogue(raw: unknown): Book[] {
  const problems: string[] = [];
  const root = raw as { version?: unknown; books?: unknown };
  if (root?.version !== 1) problems.push("version must be 1");
  if (!Array.isArray(root?.books)) throw new CatalogueError([...problems, "books must be a list"]);

  const seen = new Set<string>();
  root.books.forEach((b: Book, i: number) => {
    const at = `book[${i}]${typeof b?.id === "string" ? ` (${b.id})` : ""}`;
    const need = (ok: unknown, msg: string) => {
      if (!ok) problems.push(`${at}: ${msg}`);
    };
    need(typeof b?.id === "string" && SLUG.test(b.id), "id must be a lowercase slug");
    need(!seen.has(b?.id), "duplicate id");
    seen.add(b?.id);
    need(nonEmpty(b?.title), "title is required");
    need(Array.isArray(b?.authors) && b.authors.length > 0 && b.authors.every(nonEmpty), "at least one author");
    need(b?.language in LANGUAGES, "unknown language");
    need(Array.isArray(b?.genres) && b.genres.length > 0 && b.genres.every((g) => g in GENRES), "genres must be known values");
    need(Number.isInteger(b?.firstPublished?.year), "firstPublished.year is required");
    need(nonEmpty(b?.description) && b.description.length <= 400, "description is required (max 400 characters)");
    need(b?.contentNote === null || nonEmpty(b?.contentNote), "contentNote must be null or text");
    need(b?.file?.format === "epub" && /^\/books\/[a-z0-9-]+\.epub$/.test(b?.file?.path ?? ""), "file must be an EPUB under /books/");
    need(Number.isInteger(b?.file?.bytes) && b.file.bytes > 0, "file.bytes is required");
    need(SHA256.test(b?.file?.sha256 ?? ""), "file.sha256 must be a full SHA-256");

    const r = b?.rights;
    if (!r) {
      problems.push(`${at}: rights record is required`);
      return;
    }
    need(DATE.test(r.verifiedAt ?? ""), "rights.verifiedAt must be YYYY-MM-DD");
    const year = Number((r.verifiedAt ?? "").slice(0, 4));
    need(r.india?.status === "public-domain" && nonEmpty(r.india?.basis), "India status and basis are required");
    need(r.us?.status === "public-domain" && nonEmpty(r.us?.basis), "US status and basis are required");
    need(nonEmpty(r.edition), "edition is required");
    need(nonEmpty(r.source?.url) && nonEmpty(r.source?.retrievedFrom) && DATE.test(r.source?.retrievedAt ?? ""), "source with url, retrievedFrom and retrievedAt is required");
    need(SHA256.test(r.source?.originalSha256 ?? ""), "source.originalSha256 must be a full SHA-256");
    need(Array.isArray(r.modifications), "modifications must be a list (empty if none)");
    need(Array.isArray(r.evidence) && r.evidence.length >= 2 && r.evidence.every((e) => nonEmpty(e?.claim) && nonEmpty(e?.source)), "at least two pieces of evidence");

    // US: published more than 95 years before the verification year.
    if (Number.isInteger(b?.firstPublished?.year) && year)
      need(b.firstPublished.year <= year - 96, `first published ${b.firstPublished.year} is not before ${year - 95} (US)`);

    // India: every contributor whose work is in the file died > 60 full years before.
    const contributors = Array.isArray(r.contributors) ? r.contributors : [];
    need(contributors.some((c) => c.role === "author" && c.inFile), "at least one author contributor in the file");
    for (const c of contributors) {
      need(nonEmpty(c?.name) && ["author", "translator", "editor", "illustrator"].includes(c?.role), "contributor needs a name and a known role");
      need(Number.isInteger(c?.died), `${c?.name}: death year is required`);
      if (c?.inFile && Number.isInteger(c?.died) && year)
        need(c.died + 61 <= year, `${c.name} (died ${c.died}) is still in copyright in India in ${year}`);
    }
    // Every listed author must be documented as a contributor.
    for (const a of b?.authors ?? []) need(contributors.some((c) => c.name === a), `author ${a} has no contributor record`);
  });

  if (problems.length) throw new CatalogueError(problems);
  return root.books as Book[];
}

/** Public-domain-in-India year: 1 January of (death year + 61). */
export function indiaPublicDomainFrom(died: number): number {
  return died + 61;
}

export interface ShelfFilters {
  q: string;
  language: LanguageCode | null;
  genre: Genre | null;
}

/** Search by title or author (case- and accent-insensitive), plus language and genre. */
export function filterBooks(books: Book[], f: ShelfFilters): Book[] {
  const q = fold(f.q.trim());
  return books.filter(
    (b) =>
      (!f.language || b.language === f.language) &&
      (!f.genre || b.genres.includes(f.genre)) &&
      (!q || fold(b.title).includes(q) || b.authors.some((a) => fold(a).includes(q))),
  );
}

function fold(s: string) {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
