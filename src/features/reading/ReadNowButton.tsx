"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { catalogueKey, getProgress, type ProgressRecord } from "./storage/readingDb";

/** "Read now", or "Continue reading · 34%" when there is saved progress in this browser. */
export function ReadNowButton({ bookId }: { bookId: string }) {
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  useEffect(() => {
    let alive = true;
    void getProgress(catalogueKey(bookId)).then((p) => alive && setProgress(p));
    return () => {
      alive = false;
    };
  }, [bookId]);

  const started = progress && progress.fraction > 0;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Link
        href={`/reading/${bookId}/read`}
        className="rounded-full bg-ink px-6 py-3 font-semibold text-panel hover:bg-ink-soft"
      >
        {started ? `Continue reading (${Math.round(progress.fraction * 100)}%)` : "Read now"}
      </Link>
      {started && progress.chapter && <span className="text-sm text-ink-soft">Last read: {progress.chapter}</span>}
    </div>
  );
}
