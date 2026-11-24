"use client";

import type { SceneProps } from "@/stage/registry";
import { SceneCamera } from "@/stage/camera/SceneCamera";
import { SceneLights, SceneObjects, useSceneSettings } from "@/stage/scene-view";

/**
 * The 1990s living room (F1 blockout), drawn from content/scenes/living-room.json: room shell,
 * warm bulb and cool window light, a turning ceiling fan and models from the asset pipeline.
 * Its future place is inside one of the neighbourhood's houses.
 */
export default function LivingRoom({ level, debug, document: doc }: SceneProps) {
  useSceneSettings(doc);
  return (
    <>
      <SceneLights lights={doc.lights} shadows={level.shadows} />
      <SceneObjects objects={doc.objects} />
      <SceneCamera camera={doc.camera} debug={debug} />
    </>
  );
}
