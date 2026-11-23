import type { ComponentType } from "react";
import type { QualityLevel } from "@/engine/adaptive";

/**
 * Which page shows which 3D scene. This file is part of every page's bundle, so it must stay
 * tiny: no three.js imports, only lazy `load()` references (each becomes its own chunk).
 */

export interface SceneProps {
  /** Current adaptive quality level (pixel ratio, shadows, effects, particle share). */
  level: QualityLevel;
  /** Developer mode: the free camera is active, so scenes must not drive the camera. */
  debug: boolean;
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
  load: () => Promise<{ default: ComponentType<SceneProps> }>;
}

export const SCENES: readonly SceneEntry[] = [
  {
    id: "monsoon-neighbourhood",
    path: "/lab/monsoon",
    title: "Monsoon neighbourhood",
    description:
      "A small Indian neighbourhood on a monsoon evening: tiled-roof houses with verandas and warm amber lights, a muddy lane with puddles, coconut palms, banana plants and dark green trees, continuous rain, drifting mist and distant lightning under a charcoal sky.",
    poster: "/stage/posters/monsoon-neighbourhood.webp",
    load: () => import("@/scenes/monsoon/MonsoonNeighbourhood"),
  },
  {
    id: "living-room",
    path: "/lab/living-room",
    title: "1990s living room",
    description:
      "A warmly lit Indian living room in the 1990s on a rainy evening: a CRT television in a wooden cabinet, a sofa, a centre table, a turning ceiling fan, and rain falling past a grilled window.",
    poster: "/stage/posters/living-room.webp",
    load: () => import("@/scenes/living-room/LivingRoom"),
  },
];

export function sceneFor(pathname: string | null): SceneEntry | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  return SCENES.find((s) => s.path === path) ?? null;
}
