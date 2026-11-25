/**
 * Shared rules for TV and Music content: where an item plays from and why XPLOR9 may play it.
 *
 * Two legal routes only (a screen, not legal advice; the evidence links are the real check):
 *   - "official-upload": an embeddable upload by the rights holder's own YouTube channel, played in
 *     YouTube's official player. The channel must be on the verified allow-list
 *     (content/media/official-sources.json); an item from any other uploader is refused, however
 *     popular, because re-uploads are the common infringing case.
 *   - "public-domain": a work out of copyright in India AND the US, played from the Internet Archive
 *     (films in its player; audio recordings as plain audio through the site's shared player).
 *
 * Catalogue files are validated in tests and before use; every problem is listed with its place.
 */

/** "unknown" = not yet confirmed: shown as such rather than guessed. */
export const MEDIA_LANGUAGES = { en: "English", hi: "Hindi", kn: "Kannada", none: "No dialogue", unknown: "Language not recorded" } as const;
export type MediaLanguage = keyof typeof MEDIA_LANGUAGES;

export type MediaSource =
  | { provider: "youtube"; videoId: string }
  | { provider: "youtube-playlist"; playlistId: string }
  | { provider: "archive"; identifier: string }
  /** One audio file of an Internet Archive item, played by the site's own audio player (Music). */
  | { provider: "archive-audio"; identifier: string; file: string };

export interface Evidence {
  claim: string;
  source: string;
}

export type MediaRights =
  | { basis: "official-upload"; uploaderChannelId: string; evidence: Evidence[]; verifiedAt: string }
  | { basis: "public-domain"; india: string; us: string; evidence: Evidence[]; verifiedAt: string };

/** A YouTube channel verified as belonging to the rights holder. */
export interface OfficialChannel {
  channelId: string;
  handle: string;
  name: string;
  /** Who owns it, e.g. "Prasar Bharati (India's public broadcaster)". */
  owner: string;
  evidence: Evidence[];
  verifiedAt: string;
}

// Plain fields (not constructor shorthand) so scripts can run this file with Node's type stripping.
export class MediaCatalogueError extends Error {
  readonly what: string;
  readonly problems: string[];
  constructor(what: string, problems: string[]) {
    super(`${what} is invalid:\n- ${problems.join("\n- ")}`);
    this.name = "MediaCatalogueError";
    this.what = what;
    this.problems = problems;
  }
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^PL[A-Za-z0-9_-]{16,64}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const ARCHIVE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/;
/** A file in the item's top folder: any characters except path separators and controls. */
const ARCHIVE_FILE = /^[^/\\\x00-\x1f]{1,200}\.mp3$/i;

export const nonEmpty = (v: unknown, max = 600): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** An https link that is a real absolute URL (evidence, Where to Watch). */
export function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/** Collects problems with their place, e.g. `channel[0] (cartoons).programme[2]: …`. */
export type Need = (ok: unknown, msg: string) => void;

export function parseOfficialChannels(raw: unknown): Map<string, OfficialChannel> {
  const problems: string[] = [];
  const root = raw as { version?: unknown; youtube?: unknown };
  if (root?.version !== 1) problems.push("version must be 1");
  if (!Array.isArray(root?.youtube)) throw new MediaCatalogueError("Official channel list", [...problems, "youtube must be a list"]);
  const out = new Map<string, OfficialChannel>();
  (root.youtube as OfficialChannel[]).forEach((c, i) => {
    const at = `youtube[${i}]${typeof c?.name === "string" ? ` (${c.name})` : ""}`;
    const need: Need = (ok, msg) => void (ok || problems.push(`${at}: ${msg}`));
    need(CHANNEL_ID.test(c?.channelId ?? ""), "channelId must be a YouTube channel id (UC…)");
    need(!out.has(c?.channelId), "listed twice");
    need(/^@[A-Za-z0-9._-]{3,100}$/.test(c?.handle ?? ""), "handle must look like @name");
    need(nonEmpty(c?.name, 120) && nonEmpty(c?.owner, 200), "name and owner are required");
    checkEvidence(c?.evidence, need);
    need(DATE.test(c?.verifiedAt ?? ""), "verifiedAt must be YYYY-MM-DD");
    out.set(c?.channelId, c);
  });
  if (problems.length) throw new MediaCatalogueError("Official channel list", problems);
  return out;
}

function checkEvidence(evidence: unknown, need: Need) {
  need(
    Array.isArray(evidence) && evidence.length > 0 && evidence.every((e: Evidence) => nonEmpty(e?.claim) && isHttpsUrl(e?.source)),
    "at least one piece of evidence (claim + https source)",
  );
}

export function checkSource(s: MediaSource, need: Need) {
  switch (s?.provider) {
    case "youtube":
      return need(VIDEO_ID.test(s.videoId ?? ""), "source.videoId must be an 11-character YouTube id");
    case "youtube-playlist":
      return need(PLAYLIST_ID.test(s.playlistId ?? ""), "source.playlistId must be a YouTube playlist id (PL…)");
    case "archive":
      return need(ARCHIVE_ID.test(s.identifier ?? ""), "source.identifier must be an Internet Archive identifier");
    case "archive-audio":
      need(ARCHIVE_ID.test(s.identifier ?? ""), "source.identifier must be an Internet Archive identifier");
      return need(typeof s.file === "string" && ARCHIVE_FILE.test(s.file), "source.file must be an .mp3 file name in the item (no folders)");
    default:
      return need(false, "source.provider must be youtube, youtube-playlist, archive or archive-audio");
  }
}

/** Rights must match the source: YouTube = official upload from an allow-listed channel; Archive = public domain. */
export function checkRights(r: MediaRights, source: MediaSource, official: ReadonlyMap<string, OfficialChannel>, need: Need) {
  if (!r) return need(false, "rights record is required");
  need(DATE.test(r.verifiedAt ?? ""), "rights.verifiedAt must be YYYY-MM-DD");
  checkEvidence(r.evidence, need);
  const youtube = source?.provider === "youtube" || source?.provider === "youtube-playlist";
  if (r.basis === "official-upload") {
    need(youtube, "official uploads must play from YouTube");
    need(official.has(r.uploaderChannelId), `uploader ${r.uploaderChannelId} is not on the official channel allow-list`);
  } else if (r.basis === "public-domain") {
    need(source?.provider === "archive" || source?.provider === "archive-audio", "public-domain items must play from the Internet Archive");
    need(nonEmpty(r.india) && nonEmpty(r.us), "public domain needs the India and US basis");
  } else {
    need(false, "rights.basis must be official-upload or public-domain");
  }
}

// ---------- playing ------------------------------------------------------------------------

/**
 * The embed address for a source. YouTube uses its reduced-cookie domain; the JS API is enabled
 * so the page learns when a video ends or can't play. `origin` must be this site's origin.
 */
export function embedUrl(source: MediaSource, origin: string, options: { autoplay: boolean }): string {
  const auto = options.autoplay ? "1" : "0";
  switch (source.provider) {
    case "youtube":
    case "youtube-playlist": {
      const q = new URLSearchParams({ enablejsapi: "1", origin, rel: "0", playsinline: "1", autoplay: auto });
      if (source.provider === "youtube-playlist") q.set("list", source.playlistId);
      const path = source.provider === "youtube" ? source.videoId : "videoseries";
      return `https://www.youtube-nocookie.com/embed/${path}?${q}`;
    }
    case "archive":
      return `https://archive.org/embed/${encodeURIComponent(source.identifier)}${options.autoplay ? "?autoplay=1" : ""}`;
    case "archive-audio":
      throw new Error("Internet Archive audio plays through the site's own audio player, not an embed");
  }
}

/** The direct address of an Internet Archive audio file. */
export function archiveAudioUrl(source: { identifier: string; file: string }): string {
  return `https://archive.org/download/${encodeURIComponent(source.identifier)}/${encodeURIComponent(source.file)}`;
}

/** Where the item lives on its provider's own site (shown as "Open on YouTube / Internet Archive"). */
export function sourcePage(source: MediaSource): string {
  switch (source.provider) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${source.videoId}`;
    case "youtube-playlist":
      return `https://www.youtube.com/playlist?list=${source.playlistId}`;
    case "archive":
    case "archive-audio":
      return `https://archive.org/details/${encodeURIComponent(source.identifier)}`;
  }
}

export const PROVIDER_NAMES: Record<MediaSource["provider"], string> = {
  youtube: "YouTube",
  "youtube-playlist": "YouTube",
  archive: "Internet Archive",
  "archive-audio": "Internet Archive",
};
