import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BOOKS, getBook } from "@/features/reading/books";
import { ReaderLoader } from "@/features/reading/reader/ReaderLoader";

export function generateStaticParams() {
  return BOOKS.map((b) => ({ bookId: b.id }));
}

export async function generateMetadata({ params }: PageProps<"/reading/[bookId]/read">): Promise<Metadata> {
  const book = getBook((await params).bookId);
  return book ? { title: `Reading ${book.title}` } : {};
}

export default async function ReadPage({ params }: PageProps<"/reading/[bookId]/read">) {
  const book = getBook((await params).bookId);
  if (!book) notFound();
  return (
    <ReaderLoader
      book={{ id: book.id, title: book.title, authors: book.authors, path: book.file.path, sha256: book.file.sha256 }}
    />
  );
}
