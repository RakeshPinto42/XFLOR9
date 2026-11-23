import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportedReader } from "@/features/imports/ImportedReader";

export const metadata: Metadata = { title: "Your book", robots: { index: false, follow: false } };

/** Reader for a book imported into this browser (the file itself is only in IndexedDB). */
export default function ImportedReaderPage() {
  return (
    <Suspense fallback={<p className="px-6 py-16 text-center text-ink-soft">Opening your book…</p>}>
      <ImportedReader />
    </Suspense>
  );
}
