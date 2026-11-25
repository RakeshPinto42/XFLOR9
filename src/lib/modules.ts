/**
 * Single source of truth for XPLOR9's five entertainment modules.
 * Navigation, the homepage shelf and the "coming later" pages all read from here,
 * so a module going live is a one-line status change.
 */

export type ModuleId = "radio" | "tv" | "music" | "games" | "reading";

/** live = usable now · building = current milestone · planned = later phase */
export type ModuleStatus = "live" | "building" | "planned";

export interface XploreModule {
  id: ModuleId;
  name: string;
  href: `/${string}`;
  tagline: string;
  /** What the module will offer, shown on its page until it is live. */
  plans: string[];
  status: ModuleStatus;
}

export const MODULES: readonly XploreModule[] = [
  {
    id: "radio",
    name: "Radio",
    href: "/radio",
    tagline: "Live stations from India and around the world.",
    plans: [
      "Search stations by name, country, language and genre",
      "Favourites and recently played, saved in this browser",
      "Playback that keeps going while you explore",
      "A retro tuner dial to sweep through stations",
    ],
    status: "building",
  },
  {
    id: "tv",
    name: "TV",
    href: "/tv",
    tagline: "The family CRT set, with channels of classic, properly licensed shows.",
    plans: [
      "A CRT set that switches on with a glow",
      "Channels of public-domain and officially embedded programmes",
      "Fullscreen viewing",
    ],
    status: "building",
  },
  {
    id: "music",
    name: "Music",
    href: "/music",
    tagline: "A cassette shop of film songs and India's first gramophone records.",
    plans: [
      "Tapes of film songs from the labels' official uploads",
      "India's first gramophone records, in the public domain",
      "Favourites and recently played",
      "One player shared with radio, so two sounds never clash",
    ],
    status: "building",
  },
  {
    id: "games",
    name: "Games",
    href: "/games",
    tagline: "Saanp and Mines, playable right here.",
    plans: [
      "Original takes on classic arcade and puzzle games",
      "Keyboard and touch controls, fullscreen play",
      "High scores kept on this device",
    ],
    status: "building",
  },
  {
    id: "reading",
    name: "Reading Room",
    href: "/reading",
    tagline: "Public-domain adventure, mystery and Indian classics.",
    plans: [
      "A bookshelf of public-domain novels and stories",
      "Adjustable text size, light and dark reading modes",
      "Bookmarks and reading progress that wait for you",
    ],
    status: "building",
  },
] as const;

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  live: "On air",
  building: "Tuning in now",
  planned: "Arriving later",
};

export function getModule(id: ModuleId): XploreModule {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown XPLOR9 module: ${id}`);
  return found;
}
