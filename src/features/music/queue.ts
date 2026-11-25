"use client";

import { archiveAudioUrl } from "@/features/media/catalogue";
import { getPlaybackEngine } from "@/lib/playback/browser";
import type { PlaybackSource } from "@/lib/playback/types";
import type { Cassette, Track } from "./catalogue";

/**
 * Public-domain tapes play through the site's shared audio player (so they keep playing across
 * pages, with the mini-player). This queue moves to the tape's next track when one ends; it is a
 * module-level singleton like the player itself, so it keeps working after leaving the Music page.
 */

let cassettes: readonly Cassette[] = [];
let listening = false;

const PREFIX = "music:";

export function trackSource(c: Cassette, t: Track): PlaybackSource {
  if (t.source.provider !== "archive-audio") throw new Error(`${t.id} is not an audio track`);
  return {
    id: `${PREFIX}${c.id}:${t.id}`,
    kind: "music",
    title: t.title,
    subtitle: [t.artist, t.year, c.name].filter(Boolean).join(" · "),
    url: archiveAudioUrl(t.source),
    live: false,
  };
}

/** Which tape and track the shared player holds (null if it holds something else, e.g. radio). */
export function parseTrackId(sourceId: string | undefined): { cassetteId: string; trackId: string } | null {
  if (!sourceId?.startsWith(PREFIX)) return null;
  const [cassetteId, trackId] = sourceId.slice(PREFIX.length).split(":");
  return cassetteId && trackId ? { cassetteId, trackId } : null;
}

export function playAudioTrack(all: readonly Cassette[], c: Cassette, t: Track) {
  cassettes = all;
  listen();
  getPlaybackEngine().load(trackSource(c, t));
}

/** The track after (or before) `trackId` on its tape, or null at the end of the tape. */
export function neighbour(c: Cassette, trackId: string, dir: 1 | -1): Track | null {
  const i = c.tracks.findIndex((t) => t.id === trackId);
  return i < 0 ? null : (c.tracks[i + dir] ?? null);
}

function listen() {
  if (listening) return;
  listening = true;
  const engine = getPlaybackEngine();
  engine.subscribe(() => {
    const s = engine.getState();
    if (s.status !== "ended") return;
    const at = parseTrackId(s.source?.id);
    const c = at && cassettes.find((x) => x.id === at.cassetteId);
    const next = c && neighbour(c, at.trackId, 1);
    if (c && next) engine.load(trackSource(c, next));
  });
}
