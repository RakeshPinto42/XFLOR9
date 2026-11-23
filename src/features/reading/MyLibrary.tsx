"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookCover } from "./BookCover";
import type { Book } from "./catalogue";
import { catalogueKey, listFavourites, listRecent } from "./storage/readingDb";

type ShelfBook = Pick<Book, "id" | "title" | "authors">;

/** "Your favourites" and "Recently opened", read from this browser. Each row hides when empty. */
export function MyLibrary({ books }: { books: ShelfBook[] }) {
  const [state, setState] = useState<{ favourites: ShelfBook[]; recent: ShelfBook[] } | null>(null);

  useEffect(() => {
    let alive = true;
    const byKey = new Map(books.map((b) => [catalogueKey(b.id), b]));
    void Promise.all([listFavourites(), listRecent()]).then(([favs, recent]) => {
      if (!alive) return;
      const pick = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((b): b is ShelfBook => !!b);
      setState({ favourites: pick(favs.map((f) => f.bookKey)), recent: pick(recent.map((r) => r.bookKey)).slice(0, 6) });
    });
    return () => {
      alive = false;
    };
  }, [books]);

  if (!state) return null;
  return (
    <>
      <Row id="favourites-heading" title="Your favourites" books={state.favourites} />
      <Row id="recent-heading" title="Recently opened" books={state.recent} />
    </>
  );
}

function Row({ id, title, books }: { id: string; title: string; books: ShelfBook[] }) {
  if (books.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 id={id} className="font-display text-2xl">
        {title}
      </h2>
      <ul className="mt-4 flex gap-4 overflow-x-auto pb-2">
        {books.map((b) => (
          <li key={b.id} className="w-28 shrink-0">
            <Link href={`/reading/${b.id}`} className="book-link block rounded-lg">
              <BookCover book={b} />
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{b.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
