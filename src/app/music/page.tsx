import type { Metadata } from "next";
import officialRaw from "../../../content/media/official-sources.json";
import catalogueRaw from "../../../content/music/catalogue.json";
import { parseOfficialChannels } from "@/features/media/catalogue";
import { parseMusicCatalogue } from "@/features/music/catalogue";
import { MusicExperience } from "@/features/music/MusicExperience";

export const metadata: Metadata = {
  title: "Music",
  description: "A cassette shop on the monsoon street: film songs from the labels' official uploads, and India's first gramophone records.",
};

// Validated at build time: an invalid catalogue or a song from a non-official channel fails the build.
const official = parseOfficialChannels(officialRaw);
const cassettes = parseMusicCatalogue(catalogueRaw, official);
const uploaders = Object.fromEntries([...official.values()].map((c) => [c.channelId, c.name]));

export default function MusicPage() {
  return <MusicExperience cassettes={cassettes} uploaders={uploaders} />;
}
