"use client";

import { getPlaybackEngine } from "@/lib/playback/browser";
import type { PlaybackSource } from "@/lib/playback/types";
import { getPlayability, type Playability } from "./compatibility";
import { recordRecentPlay } from "./radioStores";
import type { Station } from "./types";

/** Radio's bridge to the shared playback engine. */

export function stationSource(station: Station): PlaybackSource {
  return {
    id: `radio:${station.id}`,
    kind: "radio",
    title: station.name,
    subtitle: [station.country, station.languages[0] && capitalise(station.languages[0])].filter(Boolean).join(", "),
    url: station.streamUrl,
    live: true,
  };
}

export function playStation(station: Station) {
  getPlaybackEngine().load(stationSource(station), {
    // Only plays that actually started count: for Radio Browser's ranking and our history.
    onStarted: () => {
      recordRecentPlay(station);
      fetch(`/api/radio/stations/${encodeURIComponent(station.id)}/click`, { method: "POST", keepalive: true }).catch(
        () => {}, // counting is best-effort and must never affect playback
      );
    },
  });
}

export function stationPlayability(station: Station): Playability {
  const engine = getPlaybackEngine();
  return getPlayability(station, (t) => engine.canPlayType(t));
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
