import type { Metadata } from "next";
import officialRaw from "../../../content/media/official-sources.json";
import catalogueRaw from "../../../content/tv/catalogue.json";
import { parseOfficialChannels } from "@/features/media/catalogue";
import { parseTvCatalogue } from "@/features/tv/catalogue";
import { TvExperience } from "@/features/tv/TvExperience";

export const metadata: Metadata = {
  title: "TV",
  description: "Classic Indian television and silent-era films on the family CRT set, in their owners' official players.",
};

// Validated at build time: an invalid catalogue or an item from a non-official channel fails the build.
const official = parseOfficialChannels(officialRaw);
const catalogue = parseTvCatalogue(catalogueRaw, official);
const uploaders = Object.fromEntries([...official.values()].map((c) => [c.channelId, c.name]));

export default function TvPage() {
  return <TvExperience catalogue={catalogue} uploaders={uploaders} />;
}
