import { archiveAudioUrl } from "@/features/media/catalogue";
import type { PlaybackSource } from "@/lib/playback/types";
import type { Cassette, Track } from "./catalogue";

/**
 * How a public-domain record becomes a source for the site's shared audio player. Records are
 * fetched with CORS (the Internet Archive allows it), so the equaliser and visualiser can
 * process them. What plays next is decided by the playlist (playlist.ts, musicPlayer.ts).
 */

const PREFIX = "music:";

export function trackSource(c: Cassette, t: Pick<Track, "id" | "title" | "artist" | "year" | "source">): PlaybackSource {
  if (t.source.provider !== "archive-audio") throw new Error(`${t.id} is not an audio track`);
  return {
    id: `${PREFIX}${c.id}:${t.id}`,
    kind: "music",
    title: t.title,
    subtitle: [t.artist, t.year, c.name].filter(Boolean).join(" · "),
    url: archiveAudioUrl(t.source),
    live: false,
    cors: true,
  };
}

/** Which tape and track the shared player holds (null if it holds something else, e.g. radio). */
export function parseTrackId(sourceId: string | undefined): { cassetteId: string; trackId: string } | null {
  if (!sourceId?.startsWith(PREFIX)) return null;
  const [cassetteId, trackId] = sourceId.slice(PREFIX.length).split(":");
  return cassetteId && trackId ? { cassetteId, trackId } : null;
}

/** The track after (or before) `trackId` on its tape, or null at the end of the tape. */
export function neighbour(c: Cassette, trackId: string, dir: 1 | -1): Track | null {
  const i = c.tracks.findIndex((t) => t.id === trackId);
  return i < 0 ? null : (c.tracks[i + dir] ?? null);
}
