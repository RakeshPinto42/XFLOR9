import type { Metadata } from "next";
import { BOOKS } from "@/features/reading/books";
import { Bookshelf } from "@/features/reading/Bookshelf";

export const metadata: Metadata = { title: "Reading Room" };

export default function ReadingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
      <div className="mb-8 max-w-3xl">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Reading Room</h1>
        <p className="mt-2 text-lg text-ink-soft">
          Adventure, mystery and folk tales you can read in full. Every book here is in the public domain in both India
          and the United States, and each one lists how we checked.
        </p>
      </div>
      <Bookshelf books={[...BOOKS]} />
    </section>
  );
}
