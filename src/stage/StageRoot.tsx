"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { sceneFor } from "./registry";

/** The 3D host (three.js, React Three Fiber) is only downloaded when a page has a scene. */
const StageHost = dynamic(() => import("./StageHost").then((m) => m.StageHost), { ssr: false });

/**
 * The single shared stage, mounted once in the root layout. Pages without a scene render
 * nothing here and download no 3D code. Moving between pages that do have scenes keeps the
 * same renderer (StageHost isn't remounted, only its scene changes).
 */
export function StageRoot() {
  const scene = sceneFor(usePathname());
  if (!scene) return null;
  return <StageHost scene={scene} />;
}
