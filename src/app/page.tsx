import officialRaw from "../../content/media/official-sources.json";
import musicRaw from "../../content/music/catalogue.json";
import tvRaw from "../../content/tv/catalogue.json";
import { parseOfficialChannels } from "@/features/media/catalogue";
import { parseMusicCatalogue } from "@/features/music/catalogue";
import { parseTvCatalogue } from "@/features/tv/catalogue";
import type { DesktopData } from "@/features/desktop/AppContent";
import { DesktopLoader } from "@/features/desktop/DesktopLoader";
import type { FeaturedVideo } from "@/features/video/VideoApp";

/**
 * The XPLOR9 computer. Catalogues are validated here at build time: an invalid catalogue, or an
 * item from a channel that isn't on the verified allow-list, fails the build.
 */
const official = parseOfficialChannels(officialRaw);
const uploaders = Object.fromEntries([...official.values()].map((c) => [c.channelId, c.name]));
const tv = parseTvCatalogue(tvRaw, official);
const cassettes = parseMusicCatalogue(musicRaw, official);

const uploaderOf = (r: { basis: string; uploaderChannelId?: string }) => (r.basis === "official-upload" && r.uploaderChannelId ? (uploaders[r.uploaderChannelId] ?? "") : "");

/** Video's Featured list: every YouTube item already in the TV and Music catalogues. */
const featured: FeaturedVideo[] = [
  ...tv.channels.flatMap((c) =>
    c.programmes
      .filter((p) => p.source.provider === "youtube" || p.source.provider === "youtube-playlist")
      .map((p) => ({ id: `tv:${p.id}`, title: p.title, meta: [c.name, p.year].filter(Boolean).join(", "), uploader: uploaderOf(p.rights), source: p.source })),
  ),
  ...cassettes.flatMap((c) =>
    c.tracks
      .filter((t) => t.source.provider === "youtube")
      .map((t) => ({ id: `music:${t.id}`, title: t.title, meta: [t.film, t.year].filter(Boolean).join(", "), uploader: uploaderOf(t.rights), source: t.source })),
  ),
];

const data: DesktopData = {
  tv: { catalogue: tv, uploaders },
  music: { cassettes, uploaders },
  video: { channels: [...official.values()].map(({ channelId, name, owner }) => ({ channelId, name, owner })), featured },
};

export default function Home() {
  return <DesktopLoader data={data} />;
}
