import { describe, expect, it } from "vitest";
import { activitySpots, audioAnchors, type ActivityKind } from "./activities";
import scene from "../../../content/scenes/monsoon-neighbourhood.json";
import type { HouseSpec } from "./house";

// World bounds from the scene file's ground.
const ground = scene.objects.find((o) => o.type === "lane-ground") as unknown as { size: [number, number]; lane: { width: number; from: number; to: number } };
const GROUND = { width: ground.size[0], laneWidth: ground.lane.width, laneStart: ground.lane.from, laneEnd: ground.lane.to };

/** A small street like the scene's layout (houses on both sides of the lane, facing it). */
const houses: HouseSpec[] = [-1, 1].flatMap((side, s) =>
  [4, -10, -24, -38].map((z, i) => ({
    position: [side * 8.6, 0, z + s * 7] as [number, number, number],
    rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    width: 7,
    depth: 5.5,
    wall: "mossy-plaster" as const,
    tint: "#e6e0d2",
    band: null,
    door: "#8a6446",
    roofPitch: 1.5,
    veranda: 1.9,
    windows: 2 as const,
    doorOpen: i === 1,
    lamp: false,
    tulsi: false,
    seed: s * 10 + i,
  })),
);

describe("F4 activity locations", () => {
  const spots = activitySpots(houses);
  it("covers every planned activity", () => {
    const kinds = new Set(spots.map((s) => s.kind));
    for (const k of ["cricket", "football", "marbles", "reading", "cycling", "chatting"] as ActivityKind[]) expect(kinds).toContain(k);
  });
  it("has unique ids and sensible group sizes", () => {
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
    for (const s of spots) expect(s.group[0]).toBeLessThanOrEqual(s.group[1]);
  });
  it("keeps every spot (and route point) inside the built world", () => {
    const inside = ([x, , z]: [number, number, number]) => Math.abs(x) < GROUND.width / 2 && z < GROUND.laneStart && z > GROUND.laneEnd;
    for (const s of spots) {
      expect(inside(s.position), s.id).toBe(true);
      for (const p of s.route ?? []) expect(inside(p), s.id).toBe(true);
    }
  });
  it("puts reading on sheltered verandas, off the lane", () => {
    for (const s of spots.filter((x) => x.kind === "reading")) {
      expect(s.sheltered).toBe(true);
      expect(Math.abs(s.position[0])).toBeGreaterThan(GROUND.laneWidth / 2);
    }
  });
});

describe("A1 audio anchors", () => {
  const anchors = audioAnchors(houses);
  it("gives every house roof rain and eave drips, plus radio, birds and neighbourhood sound", () => {
    expect(anchors.filter((a) => a.kind === "rain-on-tiles")).toHaveLength(houses.length);
    expect(anchors.filter((a) => a.kind === "eave-drips")).toHaveLength(houses.length);
    for (const k of ["distant-radio", "birds-and-frogs", "neighbourhood"]) expect(anchors.some((a) => a.kind === k)).toBe(true);
    expect(new Set(anchors.map((a) => a.id)).size).toBe(anchors.length);
  });
});
