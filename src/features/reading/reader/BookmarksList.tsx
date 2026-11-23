"use client";

import { Icon } from "@/components/Icon";
import type { BookmarkRecord } from "../storage/readingDb";

/** Bookmarks for the open book, in reading order. Jump or delete each one. */
export function BookmarksList({
  bookmarks,
  status,
  onPick,
  onDelete,
  colors,
}: {
  bookmarks: BookmarkRecord[];
  status: "loading" | "ready";
  onPick: (b: BookmarkRecord) => void;
  onDelete: (b: BookmarkRecord) => void;
  colors: { text: string; muted: string; link: string };
}) {
  if (status === "loading") return <p className="px-5 py-4 text-sm" style={{ color: colors.muted }}>Loading bookmarks…</p>;
  if (bookmarks.length === 0)
    return (
      <p className="px-5 py-4 text-sm leading-relaxed" style={{ color: colors.muted }}>
        No bookmarks yet. Use the bookmark button at the top of the page to save your place, and it will appear here.
      </p>
    );
  return (
    <ul className="px-2 py-2">
      {bookmarks.map((b) => (
        <li key={b.id} className="flex items-start gap-1">
          <button
            type="button"
            onClick={() => onPick(b)}
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left hover:bg-black/5"
          >
            <span className="block text-sm font-semibold">
              {b.chapter ?? "Bookmark"} <span style={{ color: colors.muted }}>({Math.round(b.fraction * 100)}%)</span>
            </span>
            {b.excerpt && (
              <span className="mt-0.5 block text-[0.9rem] leading-snug" style={{ color: colors.muted }}>
                {b.excerpt}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(b)}
            aria-label={`Delete bookmark${b.chapter ? ` in ${b.chapter}` : ""}`}
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
