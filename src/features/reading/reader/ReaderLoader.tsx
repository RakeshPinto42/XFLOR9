"use client";

import dynamic from "next/dynamic";
import type { ReaderBook } from "./EpubReader";

/**
 * Loads the reader (and foliate-js) only on the reader page, in the browser.
 * Other pages never download the reader code.
 */
const EpubReader = dynamic(() => import("./EpubReader").then((m) => m.EpubReader), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-30 grid place-items-center bg-[#fffcf4] text-sm text-ink-soft">Opening the reader…</div>
  ),
});

export function ReaderLoader({ book }: { book: ReaderBook }) {
  return <EpubReader book={book} />;
}
