/**
 * Where life will happen in the neighbourhood: activity locations for the F4 character system and
 * audio anchors for the A1 audio system, derived from the house layout. Used when the monsoon
 * scene file is generated (scripts/scenes/export-scenes.ts); the scene reads them from its file.
 * They are NOT the final experience: until F4, the locations are empty.
 */
import type { ActivitySpot, AudioAnchor } from "../../engine/scene/format";
import type { HouseSpec } from "./house";

export type { ActivityKind, ActivitySpot, AudioAnchor, AudioAnchorKind } from "../../engine/scene/format";

/** A point in front of a house's veranda, in world space. */
function verandaPoint(h: HouseSpec, localX: number, localZ: number): [number, number, number] {
  const c = Math.cos(h.rotationY);
  const s = Math.sin(h.rotationY);
  const [x, y, z] = h.position;
  return [x + localX * c + localZ * s, y + 0.45, z - localX * s + localZ * c];
}

export function activitySpots(houses: HouseSpec[]): ActivitySpot[] {
  const near = houses.filter((h) => h.position[2] > -40);
  const spots: ActivitySpot[] = [
    {
      id: "lane-cricket",
      kind: "cricket",
      position: [0, 0, -20],
      facing: 0,
      radius: 9,
      group: [4, 8],
      sheltered: false,
      note: "Gully cricket down the lane: a brick stack for stumps, bowler at the far end.",
    },
    {
      id: "yard-football",
      kind: "football",
      position: [-4.6, 0, -33],
      facing: Math.PI / 2,
      radius: 5,
      group: [3, 6],
      sheltered: false,
      note: "A muddy patch beside the lane; splashing through puddles.",
    },
    {
      id: "lane-cycling",
      kind: "cycling",
      position: [0.8, 0, 8],
      facing: Math.PI,
      radius: 1.2,
      group: [1, 3],
      sheltered: false,
      route: [
        [0.8, 0, 8],
        [-0.6, 0, -6],
        [0.9, 0, -22],
        [-0.4, 0, -40],
        [0.6, 0, -58],
      ],
      note: "Children cycling down the lane, ringing bells, weaving round puddles.",
    },
  ];
  near.forEach((h, i) => {
    spots.push({
      id: `veranda-reading-${i + 1}`,
      kind: "reading",
      position: verandaPoint(h, h.width / 4 + 0.3, h.depth / 2 + 0.55),
      facing: h.rotationY,
      radius: 1.2,
      group: [1, 3],
      sheltered: true,
      note: "Reading comics and storybooks on the veranda bench, out of the rain.",
    });
    if (i % 2 === 0)
      spots.push({
        id: `veranda-marbles-${i + 1}`,
        kind: "marbles",
        position: verandaPoint(h, -h.width / 4, h.depth / 2 + h.veranda * 0.5),
        facing: h.rotationY,
        radius: 1.4,
        group: [2, 4],
        sheltered: true,
        note: "A marbles game drawn on the dry veranda floor.",
      });
  });
  spots.push({
    id: "steps-chatting",
    kind: "chatting",
    position: verandaPoint(near[0], 0, near[0].depth / 2 + near[0].veranda + 0.4),
    facing: near[0].rotationY,
    radius: 1.6,
    group: [2, 4],
    sheltered: false,
    note: "Friends talking on the steps; a group interaction and dialogue spot.",
  });
  return spots;
}

export function audioAnchors(houses: HouseSpec[]): AudioAnchor[] {
  const anchors: AudioAnchor[] = houses.flatMap((h) => [
    { id: `roof-${h.seed}`, kind: "rain-on-tiles" as const, position: [h.position[0], 4.2, h.position[2]] as [number, number, number], radius: 14 },
    { id: `eaves-${h.seed}`, kind: "eave-drips" as const, position: verandaPoint(h, 0, h.depth / 2 + h.veranda + 0.45), radius: 6 },
  ]);
  const radioHouse = houses.find((h) => h.doorOpen);
  if (radioHouse) anchors.push({ id: "distant-radio", kind: "distant-radio", position: verandaPoint(radioHouse, 0, radioHouse.depth / 2 - 0.5), radius: 18 });
  anchors.push(
    { id: "trees-left", kind: "birds-and-frogs", position: [-20, 6, -20], radius: 30 },
    { id: "trees-right", kind: "birds-and-frogs", position: [20, 6, -45], radius: 30 },
    { id: "lane-far", kind: "neighbourhood", position: [0, 1.5, -75], radius: 40 },
    { id: "lane-near", kind: "neighbourhood", position: [0, 1.5, 22], radius: 30 },
  );
  return anchors;
}
