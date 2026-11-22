"use client";

import { Icon } from "@/components/Icon";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { useLocalStore } from "@/lib/storage/store";
import type { Playability } from "./compatibility";
import { playStation, stationPlayability, stationSource } from "./playback";
import { favourites, toggleFavouriteStation } from "./radioStores";
import { StationBadge } from "./StationBadge";
import type { Station } from "./types";

const NOTE: Record<Exclude<Playability, "playable">, string> = {
  unverified: "Unknown stream format, may not play",
  unsupported: "This browser can't play this stream format",
  unavailable: "This station's stream isn't available right now",
};

interface Props {
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Saved stations the directory no longer lists. */
  missing?: Set<string>;
  /** e.g. "Played 5 minutes ago", keyed by station id. */
  notes?: Map<string, string>;
}

export function StationList({ stations, selectedId, onSelect, missing, notes }: Props) {
  const player = usePlayback();
  const favs = useLocalStore(favourites);
  const favIds = new Set(favs.map((f) => f.id));

  return (
    <ul className="divide-y-2 divide-ink/10 rounded-2xl border-2 border-ink/15 bg-panel">
      {stations.map((s) => {
        const playability = stationPlayability(s);
        const gone = missing?.has(s.id) ?? false;
        const canTry = !gone && (playability === "playable" || playability === "unverified");
        const isCurrent = player.source?.id === stationSource(s).id;
        const active = isCurrent && (player.status === "loading" || player.status === "playing" || player.status === "buffering");
        const isFav = favIds.has(s.id);
        const meta = [
          s.country,
          s.languages
            .slice(0, 2)
            .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
            .join(", "),
          s.bitrate ? `${s.bitrate} kbps` : null,
        ].filter(Boolean);
        const warning = gone
          ? "No longer listed in the station directory"
          : playability !== "playable"
            ? NOTE[playability]
            : isCurrent && player.status === "error"
              ? player.error?.message
              : null;

        return (
          <li
            key={s.id}
            className={`flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 ${
              isCurrent ? "bg-radio/25" : s.id === selectedId ? "bg-radio/10" : ""
            }`}
          >
            <StationBadge name={s.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.name}</p>
              <p className="truncate text-sm text-ink-soft">{meta.join(" / ")}</p>
              {notes?.get(s.id) && <p className="text-sm text-ink-soft">{notes.get(s.id)}</p>}
              {warning && <p className="text-sm font-semibold text-music">{warning}</p>}
            </div>
            <button
              type="button"
              onClick={() => toggleFavouriteStation(s)}
              aria-pressed={isFav}
              aria-label={`${isFav ? "Remove" : "Add"} ${s.name} ${isFav ? "from" : "to"} favourites`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-ink/10"
            >
              <Icon name={isFav ? "heart" : "heartOutline"} className={`h-5 w-5 ${isFav ? "text-music" : "text-ink-soft"}`} />
            </button>
            <button
              type="button"
              disabled={!canTry}
              onClick={() => {
                onSelect(s.id);
                if (isCurrent) getPlaybackEngine().toggle();
                else playStation(s);
              }}
              aria-label={`${active ? "Pause" : "Play"} ${s.name}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-panel hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/40"
            >
              <Icon name={active ? "pause" : "play"} className="h-6 w-6" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
