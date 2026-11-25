/**
 * Re-checks every TV and Music catalogue item against its provider, because uploads get
 * removed or have embedding switched off:
 *   - YouTube: the oEmbed endpoint answers 200 only for embeddable videos/playlists, and names
 *     the uploader; it must be the allow-listed official channel.
 *   - Internet Archive: the item exists and isn't withdrawn ("dark"); a film is a film; an audio
 *     track's file is really in the item.
 * Sends only the public video/playlist/item ids. Exits with 1 if anything fails.
 *
 *   npm run media:verify
 */
import { readFileSync } from "node:fs";
import { parseOfficialChannels, type MediaSource } from "../../src/features/media/catalogue.ts";
import { parseMusicCatalogue } from "../../src/features/music/catalogue.ts";
import { allProgrammes, parseTvCatalogue } from "../../src/features/tv/catalogue.ts";

const official = parseOfficialChannels(JSON.parse(readFileSync("content/media/official-sources.json", "utf8")));
const tv = parseTvCatalogue(JSON.parse(readFileSync("content/tv/catalogue.json", "utf8")), official);
const music = parseMusicCatalogue(JSON.parse(readFileSync("content/music/catalogue.json", "utf8")), official);

const items: { id: string; source: MediaSource; uploader: string | null }[] = allProgrammes(tv).map(({ programme: p }) => ({
  id: p.id,
  source: p.source,
  uploader: p.rights.basis === "official-upload" ? p.rights.uploaderChannelId : null,
}));
for (const c of music)
  for (const t of c.tracks) items.push({ id: `${c.id}/${t.id}`, source: t.source, uploader: t.rights.basis === "official-upload" ? t.rights.uploaderChannelId : null });

async function check(item: (typeof items)[number]): Promise<string | null> {
  const { source } = item;
  if (source.provider === "archive" || source.provider === "archive-audio") {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(source.identifier)}`);
    if (!res.ok) return `Internet Archive answered ${res.status}`;
    const j = (await res.json()) as { metadata?: { mediatype?: string }; is_dark?: boolean; files?: { name: string }[] };
    if (!j.metadata) return "item not found";
    if (j.is_dark) return "item has been withdrawn";
    // Films play in the Archive's player, so the item must be a film. Audio tracks play one named
    // file (some 78 rpm items are filed as label images with the recording attached).
    if (source.provider === "archive" && j.metadata.mediatype !== "movies") return `not a film (media type ${j.metadata.mediatype})`;
    if (source.provider === "archive-audio" && !j.files?.some((f) => f.name === source.file)) return `file "${source.file}" is not in the item`;
    return null;
  }
  const page = source.provider === "youtube" ? `https://www.youtube.com/watch?v=${source.videoId}` : `https://www.youtube.com/playlist?list=${source.playlistId}`;
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`);
  if (res.status === 401) return "embedding is switched off by the owner";
  if (res.status === 404 || res.status === 400) return "not found (removed or private)";
  if (!res.ok) return `YouTube answered ${res.status}`;
  const j = (await res.json()) as { author_url?: string; title?: string };
  const handle = (j.author_url ?? "").split("/").pop()?.toLowerCase();
  const expected = item.uploader ? official.get(item.uploader)?.handle.toLowerCase() : undefined;
  if (!expected || handle !== expected) return `uploaded by ${j.author_url}, not the allow-listed ${expected}`;
  return null;
}

let failed = 0;
for (const item of items) {
  let problem: string | null;
  try {
    problem = await check(item);
  } catch (e) {
    problem = `request failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (problem) failed++;
  console.log(`${problem ? "FAIL" : "ok  "} ${item.id}${problem ? ` — ${problem}` : ""}`);
}
console.log(`\n${items.length - failed}/${items.length} items verified on ${new Date().toISOString().slice(0, 10)}.`);
process.exit(failed ? 1 : 0);
