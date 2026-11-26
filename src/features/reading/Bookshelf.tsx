"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookCover } from "./BookCover";
import { GENRES, LANGUAGES, filterBooks, type Book, type Genre, type LanguageCode } from "./catalogue";

/**
 * The public bookshelf, as an explorer folder: search by title or author, filter by language and
 * genre, and see the books as Icons (covers) or Details (a sortable list). Only languages and
 * genres that actually exist in the catalogue are offered. The view is remembered for this visit.
 */
type View = "icons" | "details";
type SortKey = "title" | "author" | "year";

export function Bookshelf({ books }: { books: Book[] }) {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [genre, setGenre] = useState<Genre | null>(null);
  const [view, setView] = useState<View>("icons");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "title", desc: false });

  const languages = useMemo(() => [...new Set(books.map((b) => b.language))], [books]);
  const genres = useMemo(() => (Object.keys(GENRES) as Genre[]).filter((g) => books.some((b) => b.genres.includes(g))), [books]);
  const found = filterBooks(books, { q, language, genre });
  const shown = view === "details" ? sortBooks(found, sort.key, sort.desc) : found;
  const filtered = !!(q.trim() || language || genre);

  return (
    <section aria-labelledby="shelf-heading">
      <h2 id="shelf-heading" className="mb-3 text-lg font-semibold">
        Bookshelf
      </h2>
      <div className="rx-toolbar">
        <label className="sr-only" htmlFor="shelf-search">
          Search by title or author
        </label>
        <input
          id="shelf-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
          placeholder="Try Kipling or Sherlock"
          className="rx-search"
        />
        <div className="rx-views" role="group" aria-label="View">
          {(["icons", "details"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "icons" ? "Icons" : "Details"}
            </button>
          ))}
        </div>
        <ChipRow label="Language" options={languages.map((l) => [l, LANGUAGES[l]] as const)} value={language} onChange={setLanguage} />
        <ChipRow label="Genre" options={genres.map((g) => [g, GENRES[g]] as const)} value={genre} onChange={setGenre} />
      </div>

      <p className="my-3 text-sm text-ink-soft" aria-live="polite">
        {filtered ? `${shown.length} of ${books.length} books` : `${books.length} books`}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/25 px-5 py-8 text-center">
          <p className="font-semibold">No books match{q.trim() ? ` “${q.trim()}”` : ""} with these filters.</p>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setLanguage(null);
              setGenre(null);
            }}
            className="rx-chip mt-4"
          >
            Clear search and filters
          </button>
        </div>
      ) : view === "icons" ? (
        <ul className="rx-icons">
          {shown.map((b) => (
            <li key={b.id}>
              <Link href={`/reading/${b.id}`} className="rx-icon">
                <BookCover book={b} />
                <p className="rx-icon-title">{b.title}</p>
                <p className="rx-icon-meta">
                  {b.authors.join(", ")}, {b.firstPublished.year}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <table className="rx-details">
          <thead>
            <tr>
              <SortHead label="Title" k="title" sort={sort} onSort={setSort} />
              <SortHead label="Author" k="author" sort={sort} onSort={setSort} />
              <th scope="col" className="rx-col-wide">
                Language
              </th>
              <th scope="col" className="rx-col-wide">
                Genre
              </th>
              <SortHead label="First published" k="year" sort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/reading/${b.id}`}>
                    <span className="rx-mini-cover">
                      <BookCover book={b} />
                    </span>
                    {b.title}
                  </Link>
                </td>
                <td>{b.authors.join(", ")}</td>
                <td className="rx-col-wide">{LANGUAGES[b.language]}</td>
                <td className="rx-col-wide">{b.genres.map((g) => GENRES[g]).join(", ")}</td>
                <td>{b.firstPublished.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function sortBooks(list: Book[], key: SortKey, desc: boolean): Book[] {
  const value = (b: Book): string | number => (key === "title" ? b.title.toLowerCase() : key === "author" ? (b.authors[0] ?? "").toLowerCase() : b.firstPublished.year);
  const out = [...list].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return desc ? out.reverse() : out;
}

function SortHead({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; desc: boolean }; onSort: (s: { key: SortKey; desc: boolean }) => void }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => onSort({ key: k, desc: active ? !sort.desc : false })}>
        {label}
        {active && <span aria-hidden>{sort.desc ? " ▾" : " ▴"}</span>}
      </button>
    </th>
  );
}

function ChipRow<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T | null; onChange: (v: T | null) => void }) {
  return (
    <div role="group" aria-label={label} className="rx-chips basis-full">
      <span>{label}</span>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)} className="rx-chip">
          {text}
        </button>
      ))}
    </div>
  );
}
