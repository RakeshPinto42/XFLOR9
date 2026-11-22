"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookCover } from "./BookCover";
import { GENRES, LANGUAGES, filterBooks, type Book, type Genre, type LanguageCode } from "./catalogue";

/**
 * The public bookshelf: search by title or author, filter by language and genre.
 * Only languages and genres that actually exist in the catalogue are offered.
 */
export function Bookshelf({ books }: { books: Book[] }) {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [genre, setGenre] = useState<Genre | null>(null);

  const languages = useMemo(() => [...new Set(books.map((b) => b.language))], [books]);
  const genres = useMemo(
    () => (Object.keys(GENRES) as Genre[]).filter((g) => books.some((b) => b.genres.includes(g))),
    [books],
  );
  const shown = filterBooks(books, { q, language, genre });
  const filtered = !!(q.trim() || language || genre);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <label className="block max-w-xl">
          <span className="mb-1 block text-sm font-semibold">Search by title or author</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={80}
            placeholder="Try Kipling or Sherlock"
            className="w-full rounded-xl border-2 border-ink/25 bg-panel px-4 py-2.5 placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
          />
        </label>
        <ChipRow
          label="Language"
          options={languages.map((l) => [l, LANGUAGES[l]] as const)}
          value={language}
          onChange={setLanguage}
        />
        <ChipRow label="Genre" options={genres.map((g) => [g, GENRES[g]] as const)} value={genre} onChange={setGenre} />
      </div>

      <p className="text-sm text-ink-soft" aria-live="polite">
        {filtered ? `${shown.length} of ${books.length} books` : `${books.length} books`}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink/25 px-5 py-8 text-center">
          <p className="font-semibold">No books match{q.trim() ? ` “${q.trim()}”` : ""} with these filters.</p>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setLanguage(null);
              setGenre(null);
            }}
            className="mt-4 rounded-full border-2 border-ink px-4 py-1.5 text-sm font-semibold hover:bg-ink/10"
          >
            Clear search and filters
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((b) => (
            <li key={b.id}>
              <Link href={`/reading/${b.id}`} className="book-link block rounded-lg">
                <div className="book-slot">
                  <BookCover book={b} className="mx-auto w-[85%]" />
                </div>
                <p className="mt-3 font-semibold leading-snug">{b.title}</p>
                <p className="text-sm text-ink-soft">
                  {b.authors.join(", ")}, {b.firstPublished.year}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div role="group" aria-label={label} className="sm:flex sm:items-center sm:gap-2">
      <span className="mb-1.5 block text-sm font-semibold sm:mb-0 sm:w-20 sm:shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(value === v ? null : v)}
            className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${
              value === v ? "border-ink bg-ink text-panel" : "border-ink/25 bg-panel hover:border-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
