/**
 * The Music catalogue (content/music/catalogue.json): cassettes on the shop shelf, each a list of
 * tracks XPLOR9 may play. A cassette plays one way: either every track is an official YouTube
 * upload (shown in the shop's little TV, as YouTube requires its player to be visible) or every
 * track is a public-domain recording played as audio through the site's own player.
 * Cassette names and designs are XPLOR9's own: no label names or logos on the tapes.
 */
import {
  checkRights,
  checkSource,
  MEDIA_LANGUAGES,
  MediaCatalogueError,
  nonEmpty,
  SLUG,
  type MediaLanguage,
  type MediaRights,
  type MediaSource,
  type Need,
  type OfficialChannel,
} from "../media/catalogue.ts"; // relative with extension: also run by scripts/media (Node)

export interface Track {
  id: string;
  title: string;
  /** Singers or players, as credited by the upload; null if not recorded. */
  artist: string | null;
  /** Film the song is from, if any. */
  film: string | null;
  year: number | null;
  language: MediaLanguage;
  source: MediaSource;
  rights: MediaRights;
}

export interface Cassette {
  id: string;
  /** Written on the label, e.g. "Rainy Day Romance". */
  name: string;
  description: string;
  /** The tape's own look (shell and label colours). */
  colours: { shell: string; label: string };
  tracks: Track[];
}

export type CassettePlayback = "video" | "audio";

const COLOUR = /^#[0-9a-f]{6}$/;

export function parseMusicCatalogue(raw: unknown, official: ReadonlyMap<string, OfficialChannel>): Cassette[] {
  const problems: string[] = [];
  const root = raw as { version?: unknown; cassettes?: unknown };
  if (root?.version !== 1) problems.push("version must be 1");
  if (!Array.isArray(root?.cassettes)) throw new MediaCatalogueError("Music catalogue", [...problems, "cassettes must be a list"]);
  const ids = new Set<string>();
  const uniqueId = (id: unknown, need: Need) => {
    need(typeof id === "string" && SLUG.test(id), "id must be a lowercase slug");
    need(!ids.has(id as string), "id is used twice");
    ids.add(id as string);
  };
  (root.cassettes as Cassette[]).forEach((c, ci) => {
    const at = `cassette[${ci}]${typeof c?.id === "string" ? ` (${c.id})` : ""}`;
    const need: Need = (ok, msg) => void (ok || problems.push(`${at}: ${msg}`));
    uniqueId(c?.id, need);
    need(nonEmpty(c?.name, 40), "name is required (max 40 characters)");
    need(nonEmpty(c?.description, 300), "description is required (max 300 characters)");
    need(COLOUR.test(c?.colours?.shell ?? "") && COLOUR.test(c?.colours?.label ?? ""), 'colours.shell and colours.label must be like "#a1b2c3"');
    const tracks = Array.isArray(c?.tracks) ? c.tracks : [];
    need(tracks.length > 0, "needs at least one track");
    tracks.forEach((t, ti) => {
      const tat = `${at}.track[${ti}]${typeof t?.id === "string" ? ` (${t.id})` : ""}`;
      const tneed: Need = (ok, msg) => void (ok || problems.push(`${tat}: ${msg}`));
      uniqueId(t?.id, tneed);
      tneed(nonEmpty(t?.title, 160), "title is required");
      tneed(t?.artist === null || nonEmpty(t?.artist, 200), "artist must be null or text");
      tneed(t?.film === null || nonEmpty(t?.film, 120), "film must be null or text");
      tneed(t?.year === null || (Number.isInteger(t?.year) && t.year >= 1890 && t.year <= 2100), "year must be null or a year");
      tneed(t?.language in MEDIA_LANGUAGES, "unknown language");
      tneed(t?.source?.provider === "youtube" || t?.source?.provider === "archive-audio", "a track plays from a YouTube video or an Internet Archive audio file");
      checkSource(t?.source, tneed);
      checkRights(t?.rights, t?.source, official, tneed);
    });
    const kinds = new Set(tracks.map((t) => t?.source?.provider));
    need(kinds.size <= 1, "all tracks on a cassette must play the same way (all YouTube or all Internet Archive audio)");
  });
  if (problems.length) throw new MediaCatalogueError("Music catalogue", problems);
  return root.cassettes as Cassette[];
}

/** How a cassette plays: in the shop's TV (YouTube) or as audio in the deck (public domain). */
export function cassettePlayback(c: Cassette): CassettePlayback {
  return c.tracks[0].source.provider === "archive-audio" ? "audio" : "video";
}
