/**
 * The TV catalogue (content/tv/catalogue.json): themed channels of programmes XPLOR9 may play,
 * plus a "Where to Watch" guide for classics that can't be embedded (links to their official
 * platforms). Channel names are XPLOR9's own: no real broadcaster names or logos.
 */
import {
  checkRights,
  checkSource,
  isHttpsUrl,
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

export interface Programme {
  id: string;
  title: string;
  description: string;
  language: MediaLanguage;
  /** Year first shown or released; null if not known reliably. */
  year: number | null;
  source: MediaSource;
  rights: MediaRights;
}

export interface TvChannel {
  id: string;
  /** Shown on the dial, e.g. "Story Hour". */
  name: string;
  description: string;
  programmes: Programme[];
}

export type WatchAccess = "free" | "subscription" | "rent-or-buy";
export const WATCH_ACCESS: Record<WatchAccess, string> = { free: "Free", subscription: "Subscription", "rent-or-buy": "Rent or buy" };

export interface GuideEntry {
  id: string;
  title: string;
  /** e.g. "1986–1987" */
  years: string;
  language: MediaLanguage;
  description: string;
  watch: { platform: string; url: string; access: WatchAccess }[];
  verifiedAt: string;
}

export interface TvCatalogue {
  channels: TvChannel[];
  guide: GuideEntry[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTvCatalogue(raw: unknown, official: ReadonlyMap<string, OfficialChannel>): TvCatalogue {
  const problems: string[] = [];
  const root = raw as { version?: unknown; channels?: unknown; guide?: unknown };
  if (root?.version !== 1) problems.push("version must be 1");
  if (!Array.isArray(root?.channels) || !Array.isArray(root?.guide)) throw new MediaCatalogueError("TV catalogue", [...problems, "channels and guide must be lists"]);
  const ids = new Set<string>();
  const uniqueId = (id: unknown, need: Need) => {
    need(typeof id === "string" && SLUG.test(id), "id must be a lowercase slug");
    need(!ids.has(id as string), "id is used twice");
    ids.add(id as string);
  };

  (root.channels as TvChannel[]).forEach((c, ci) => {
    const at = `channel[${ci}]${typeof c?.id === "string" ? ` (${c.id})` : ""}`;
    const need: Need = (ok, msg) => void (ok || problems.push(`${at}: ${msg}`));
    uniqueId(c?.id, need);
    need(nonEmpty(c?.name, 40), "name is required (max 40 characters)");
    need(nonEmpty(c?.description, 300), "description is required (max 300 characters)");
    need(Array.isArray(c?.programmes) && c.programmes.length > 0, "needs at least one programme");
    (Array.isArray(c?.programmes) ? c.programmes : []).forEach((p, pi) => {
      const pat = `${at}.programme[${pi}]${typeof p?.id === "string" ? ` (${p.id})` : ""}`;
      const pneed: Need = (ok, msg) => void (ok || problems.push(`${pat}: ${msg}`));
      uniqueId(p?.id, pneed);
      pneed(nonEmpty(p?.title, 160), "title is required");
      pneed(nonEmpty(p?.description, 400), "description is required (max 400 characters)");
      pneed(p?.language in MEDIA_LANGUAGES, "unknown language");
      pneed(p?.year === null || (Number.isInteger(p?.year) && p.year >= 1890 && p.year <= 2100), "year must be null or a year");
      checkSource(p?.source, pneed);
      checkRights(p?.rights, p?.source, official, pneed);
    });
  });

  (root.guide as GuideEntry[]).forEach((g, gi) => {
    const at = `guide[${gi}]${typeof g?.id === "string" ? ` (${g.id})` : ""}`;
    const need: Need = (ok, msg) => void (ok || problems.push(`${at}: ${msg}`));
    uniqueId(g?.id, need);
    need(nonEmpty(g?.title, 160) && nonEmpty(g?.years, 40), "title and years are required");
    need(g?.language in MEDIA_LANGUAGES, "unknown language");
    need(nonEmpty(g?.description, 400), "description is required (max 400 characters)");
    need(
      Array.isArray(g?.watch) &&
        g.watch.length > 0 &&
        g.watch.every((w) => nonEmpty(w?.platform, 80) && isHttpsUrl(w?.url) && w?.access in WATCH_ACCESS),
      "watch needs at least one platform with an https link and an access type",
    );
    need(DATE.test(g?.verifiedAt ?? ""), "verifiedAt must be YYYY-MM-DD");
  });

  if (problems.length) throw new MediaCatalogueError("TV catalogue", problems);
  return { channels: root.channels as TvChannel[], guide: root.guide as GuideEntry[] };
}

/** Every programme with its channel, in dial order (for next/previous across channels). */
export function allProgrammes(c: TvCatalogue): { channel: TvChannel; programme: Programme }[] {
  return c.channels.flatMap((channel) => channel.programmes.map((programme) => ({ channel, programme })));
}
