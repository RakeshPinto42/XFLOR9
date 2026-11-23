"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { catalogueKey, isFavourite, setFavourite } from "./storage/readingDb";

/** Add or remove a book from favourites (saved in this browser). */
export function FavouriteButton({ bookId, title }: { bookId: string; title: string }) {
  const [fav, setFav] = useState<boolean | null>(null); // null while loading
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void isFavourite(catalogueKey(bookId)).then((v) => alive && setFav(v));
    return () => {
      alive = false;
    };
  }, [bookId]);

  async function toggle() {
    const next = !fav;
    const result = await setFavourite(catalogueKey(bookId), next);
    if (result === null) setError(true);
    else {
      setError(false);
      setFav(result);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={fav === null}
        aria-pressed={!!fav}
        aria-label={fav ? `Remove ${title} from favourites` : `Add ${title} to favourites`}
        className="inline-flex items-center gap-2 rounded-full border-2 border-ink px-5 py-[0.65rem] font-semibold hover:bg-ink/10 disabled:opacity-50"
      >
        <Icon name={fav ? "heart" : "heartOutline"} className={`h-5 w-5 ${fav ? "text-music" : ""}`} />
        {fav ? "In favourites" : "Add to favourites"}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-sm font-semibold text-music">
          This browser isn&apos;t allowing XPLOR9 to save favourites.
        </span>
      )}
    </span>
  );
}
