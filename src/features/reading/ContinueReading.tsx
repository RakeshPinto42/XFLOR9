"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookCover } from "./BookCover";
import type { Book } from "./catalogue";
import { catalogueKey, inProgress, listProgress, type ProgressRecord } from "./storage/readingDb";

/** Books started in this browser and not yet finished, most recent first. Hidden when there are none. */
export function ContinueReading({ books }: { books: Pick<Book, "id" | "title" | "authors">[] }) {
  const [records, setRecords] = useState<ProgressRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    void listProgress().then((r) => alive && setRecords(inProgress(r)));
    return () => {
      alive = false;
    };
  }, []);

  const items = (records ?? [])
    .map((r) => ({ r, book: books.find((b) => catalogueKey(b.id) === r.bookKey) }))
    .filter((x): x is { r: ProgressRecord; book: (typeof books)[number] } => !!x.book)
    .slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="continue-heading" className="mb-10">
      <h2 id="continue-heading" className="font-display text-2xl">
        Continue reading
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ r, book }) => {
          const pct = Math.round(r.fraction * 100);
          return (
            <li key={book.id}>
              <Link
                href={`/reading/${book.id}/read`}
                className="flex items-center gap-4 rounded-2xl border-2 border-ink/15 bg-panel p-3 hover:border-ink"
              >
                <BookCover book={book} className="w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{book.title}</p>
                  {r.chapter && <p className="truncate text-sm text-ink-soft">{r.chapter}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/15" aria-hidden>
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-xs tabular-nums text-ink-soft">{pct}%</span>
                  </div>
                  <span className="sr-only">{pct}% read</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
