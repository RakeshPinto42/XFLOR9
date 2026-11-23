import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BOOKS, getBook } from "@/features/reading/books";
import { BookCover } from "@/features/reading/BookCover";
import { GENRES, LANGUAGES, indiaPublicDomainFrom } from "@/features/reading/catalogue";
import { ReadNowButton } from "@/features/reading/ReadNowButton";

export function generateStaticParams() {
  return BOOKS.map((b) => ({ bookId: b.id }));
}

export async function generateMetadata({ params }: PageProps<"/reading/[bookId]">): Promise<Metadata> {
  const book = getBook((await params).bookId);
  return book ? { title: `${book.title} | Reading Room`, description: book.description } : {};
}

const ROLE: Record<string, string> = { author: "Author", translator: "Translator", editor: "Editor", illustrator: "Illustrator" };

export default async function BookPage({ params }: PageProps<"/reading/[bookId]">) {
  const book = getBook((await params).bookId);
  if (!book) notFound();
  const r = book.rights;
  const kb = Math.round(book.file.bytes / 1024);

  return (
    <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
      <Link href="/reading" className="text-sm font-semibold underline underline-offset-4">
        Back to the Reading Room
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[16rem_1fr] md:gap-12">
        <div className="mx-auto w-48 md:w-full">
          <div className="book-slot">
            <BookCover book={book} />
          </div>
        </div>

        <div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{book.title}</h1>
          <p className="mt-2 text-lg text-ink-soft">{book.authors.join(", ")}</p>

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.95rem]">
            <dt className="font-semibold">Language</dt>
            <dd>{LANGUAGES[book.language]}</dd>
            <dt className="font-semibold">Genre</dt>
            <dd>{book.genres.map((g) => GENRES[g]).join(", ")}</dd>
            <dt className="font-semibold">First published</dt>
            <dd>{book.firstPublished.year}</dd>
            <dt className="font-semibold">Format</dt>
            <dd>EPUB, {kb} KB</dd>
          </dl>

          <p className="mt-6 max-w-prose text-lg leading-relaxed">{book.description}</p>

          {book.contentNote && (
            <p className="mt-5 max-w-prose rounded-xl border-l-4 border-music bg-panel px-4 py-3 text-[0.95rem]">
              <span className="font-semibold">Content note: </span>
              {book.contentNote}
            </p>
          )}

          <ReadNowButton bookId={book.id} />

          <section aria-labelledby="rights" className="mt-10 max-w-prose">
            <h2 id="rights" className="font-display text-2xl">
              Rights and source
            </h2>
            <ul className="mt-3 space-y-2 text-[0.95rem]">
              <li>
                <span className="font-semibold">India: public domain. </span>
                {r.india.basis}
              </li>
              <li>
                <span className="font-semibold">United States: public domain. </span>
                {r.us.basis}
              </li>
            </ul>

            <h3 className="mt-5 font-semibold">Contributors</h3>
            <ul className="mt-2 space-y-1.5 text-[0.95rem]">
              {r.contributors.map((c) => (
                <li key={`${c.role}-${c.name}`}>
                  {c.name} ({ROLE[c.role]}, {c.born ?? "?"}–{c.died}): public domain in India since{" "}
                  {indiaPublicDomainFrom(c.died)}.{c.note ? ` ${c.note}` : ""}
                  {!c.inFile && " Not included in this file."}
                </li>
              ))}
            </ul>

            <h3 className="mt-5 font-semibold">Edition</h3>
            <p className="mt-1 text-[0.95rem]">
              {r.edition}{" "}
              <a href={r.source.url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                View at {r.source.name}
              </a>
            </p>

            {r.modifications.length > 0 && (
              <>
                <h3 className="mt-5 font-semibold">Changes made by XPLOR9</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.95rem]">
                  {r.modifications.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}

            <details className="mt-5 text-[0.95rem]">
              <summary className="cursor-pointer font-semibold">Evidence ({r.evidence.length} sources)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {r.evidence.map((e) => (
                  <li key={`${e.claim}-${e.source}`}>
                    {e.claim}:{" "}
                    {e.source.startsWith("https://") ? (
                      <a href={e.source} className="break-all underline underline-offset-2" target="_blank" rel="noreferrer">
                        {e.source}
                      </a>
                    ) : (
                      e.source
                    )}
                  </li>
                ))}
              </ul>
            </details>

            <p className="mt-5 text-sm text-ink-soft">
              Rights researched and recorded on {r.verifiedAt}. This is documented research, not legal advice.
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
