import type { ComponentType } from "react";
import type { QualityLevel } from "@/engine/adaptive";
import type { SceneDocument } from "@/engine/scene/format";

/**
 * Which page shows which 3D scene. This file is part of every page's bundle, so it must stay
 * tiny: no three.js imports, only lazy `load()` references (each becomes its own chunk).
 */

export interface SceneProps {
  /** Current adaptive quality level (pixel ratio, shadows, effects, particle share). */
  level: QualityLevel;
  /** Developer mode: the free camera is active, so scenes must not drive the camera. */
  debug: boolean;
  /** The scene file (content/scenes/<id>.json), already upgraded and validated. */
  document: SceneDocument;
}

export interface SceneEntry {
  id: string;
  /** Exact page path that shows this scene. */
  path: string;
  title: string;
  /** Plain-language description of what the scene shows (screen readers, Lite/Still alt text). */
  description: string;
  /** Image rendered from the scene, used by Lite and Still (and while Full loads). */
  poster: string;
  /** The renderer for this scene (its own chunk, with three.js). */
  load: () => Promise<{ default: ComponentType<SceneProps> }>;
  /** The scene file it draws (its own chunk; validated before use). */
  document: () => Promise<{ default: unknown }>;
}

export const SCENES: readonly SceneEntry[] = [
  {
    // The homepage: Monsoon Lane, with a painted signboard for each module (same scene file).
    id: "home-street",
    path: "/",
    title: "Monsoon Lane",
    description:
      "A small Indian lane on a monsoon evening: tiled-roof houses with warm lights, rain and mist, and five hand-painted signboards on wooden posts along the lane for Radio, TV, Music, Games and the Reading Room.",
    poster: "/stage/posters/monsoon-neighbourhood.webp",
    load: () => import("@/scenes/home/HomeStreet"),
    document: () => import("../../content/scenes/monsoon-neighbourhood.json"),
  },
  {
    id: "monsoon-neighbourhood",
    path: "/lab/monsoon",
    title: "Monsoon neighbourhood",
    description:
      "A small Indian neighbourhood on a monsoon evening: tiled-roof houses with verandas and warm amber lights, a muddy lane with puddles, coconut palms, banana plants and dark green trees, continuous rain, drifting mist and distant lightning under a charcoal sky.",
    poster: "/stage/posters/monsoon-neighbourhood.webp",
    load: () => import("@/scenes/monsoon/MonsoonNeighbourhood"),
    document: () => import("../../content/scenes/monsoon-neighbourhood.json"),
  },
  {
    id: "living-room",
    path: "/lab/living-room",
    title: "1990s living room",
    description:
      "A warmly lit Indian living room in the 1990s on a rainy evening: a CRT television in a wooden cabinet, a sofa, a centre table, a turning ceiling fan, and rain falling past a grilled window.",
    poster: "/stage/posters/living-room.webp",
    load: () => import("@/scenes/living-room/LivingRoom"),
    document: () => import("../../content/scenes/living-room.json"),
  },
  {
    // M3: the TV module is the family CRT in the same living room (same scene file and poster).
    id: "tv-room",
    path: "/tv",
    title: "The family TV",
    description:
      "The family CRT television in its wooden cabinet in a warmly lit 1990s Indian living room on a rainy evening. When a programme is chosen the set glows on and the view moves in to its screen.",
    poster: "/stage/posters/living-room.webp",
    load: () => import("@/scenes/tv/TvRoom"),
    document: () => import("../../content/scenes/living-room.json"),
  },
  {
    // M4: the Music module is a cassette shop on the monsoon street.
    id: "cassette-shop",
    path: "/music",
    title: "Cassette shop",
    description:
      "A small cassette shop at dusk: shelves of tapes on yellowed walls, a wooden counter with a portable tape deck and a little TV, a plastic chair for the shopkeeper, and blue evening light through the side doorway.",
    poster: "/stage/posters/cassette-shop.webp",
    load: () => import("@/scenes/music/MusicShop"),
    document: () => import("../../content/scenes/cassette-shop.json"),
  },
];

export function sceneFor(pathname: string | null): SceneEntry | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  return SCENES.find((s) => s.path === path) ?? null;
}
