"use client";

import { useMemo } from "react";
import type { Vec3 } from "@/engine/scene/format";
import type { SceneProps } from "@/stage/registry";
import { SceneLights, SceneObjects, useSceneSettings } from "@/stage/scene-view";
import { CrtGlass, GlideCamera, ScreenReporter, television01Glass, useScreenRoom, type Shot } from "@/stage/screen/CrtScreen";

/**
 * The TV module's room (M3): the 1990s living room from its scene file, with the family CRT that
 * switches on. Choosing a programme switches the set on (a bright line opens into a glowing
 * screen that lights the room), and the camera glides in until the screen fills the view; the
 * page then places the real player exactly on the glass (see features/media/screenState.ts).
 */

/** Share of the window the screen may fill while watching (room is left for the remote below). */
const FILL = { height: 0.56, width: 0.9 };
/** The room shot: the set right of centre, so the programme guide (left) never hides it. Relative to the TV. */
const ROOM_SHOT = { position: [-0.35, 0.55, 3.45] as Vec3, target: [-1.1, 0.2, 0] as Vec3 };

export default function TvRoom({ level, debug, document: doc }: SceneProps) {
  useSceneSettings(doc);
  useScreenRoom();
  const tv = doc.objects.find((o) => o.id === "tv");
  const tvAt: Vec3 = tv && "position" in tv ? tv.position : [0, 0.76, -1.85];
  const key = tvAt.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed only when the TV moves (key)
  const glass = useMemo(() => television01Glass(tvAt), [key]);
  const room: Shot = useMemo(
    () => ({
      position: [tvAt[0] + ROOM_SHOT.position[0], tvAt[1] + ROOM_SHOT.position[1], tvAt[2] + ROOM_SHOT.position[2]],
      target: [tvAt[0] + ROOM_SHOT.target[0], tvAt[1] + ROOM_SHOT.target[1], tvAt[2] + ROOM_SHOT.target[2]],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed only when the TV moves (key)
    [key],
  );
  return (
    <>
      <SceneLights lights={doc.lights} shadows={level.shadows} />
      <SceneObjects objects={doc.objects} />
      <CrtGlass {...glass} />
      <ScreenReporter {...glass} debug={debug} />
      <GlideCamera room={room} glass={glass} fill={FILL} debug={debug} camera={doc.camera} />
    </>
  );
}
