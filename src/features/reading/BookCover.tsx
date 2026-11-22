import type { Book } from "./catalogue";

const TONES = ["mint", "navy", "mustard", "orange", "purple", "blue"] as const;

/** Original typographic cover (no third-party artwork). The colour is stable per book. */
export function BookCover({ book, className = "" }: { book: Pick<Book, "id" | "title" | "authors">; className?: string }) {
  let hash = 0;
  for (const ch of book.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div className={`book-cover ${className}`} data-tone={TONES[hash % TONES.length]} aria-hidden>
      <p className="book-cover__title">{book.title}</p>
      <p className="book-cover__author">{book.authors.join(", ")}</p>
    </div>
  );
}
