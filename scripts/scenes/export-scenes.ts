/**
 * Writes the scene files for the two existing scenes (content/scenes/*.json) from the layouts
 * that were previously hard-coded in their components. A one-off conversion for F2, kept so the
 * files can be regenerated and reviewed; from now on the scene FILES are the source of truth
 * (later edited by the Cinematic Studio). Every file is validated before it is written.
 *
 *   npm run scenes:export
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseScene, serializeScene, SCENE_FORMAT_VERSION, type SceneDocument, type SceneObject, type Vec3 } from "../../src/engine/scene/format.ts";
import { seeded } from "../../src/scenes/monsoon/atmosphere.ts";
import { activitySpots, audioAnchors } from "../../src/scenes/monsoon/activities.ts";
import type { HouseSpec } from "../../src/scenes/monsoon/house.tsx";

// ---------- monsoon neighbourhood (the generator that used to run in the browser) -----------

function monsoon(): SceneDocument {
  const rnd = seeded(2026);
  const houses: HouseSpec[] = [];
  const sides: [number, number[]][] = [
    [-1, [4, -10, -24, -38, -54]],
    [1, [-3, -17, -31, -46, -62]],
  ];
  let seed = 1;
  for (const [side, zs] of sides) {
    for (const z of zs) {
      const width = 6 + rnd() * 2.4;
      const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
      houses.push({
        position: [side * (8.2 + rnd() * 1.2), 0, z],
        rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        width,
        depth: 5 + rnd() * 1.2,
        wall: rnd() < 0.6 ? "mossy-plaster" : "yellow-plaster",
        tint: pick(["#e6e0d2", "#d9cdb2", "#cfd3c4", "#e3d3a8", "#c8c2b0", "#d6c3a0"]),
        band: rnd() < 0.55 ? pick(["#7a4a3a", "#4f6b5a", "#6b5b8a", "#8a6a3a", "#3f5f78"]) : null,
        door: pick(["#8a6446", "#5d7a6a", "#6f4f36", "#4f6a86", "#8a5a3c"]),
        roofPitch: 1.35 + rnd() * 0.5,
        veranda: 1.7 + rnd() * 0.6,
        windows: rnd() < 0.4 ? 3 : 2,
        tulsi: rnd() < 0.4,
        doorOpen: rnd() < 0.35,
        // Real lights only near the camera's path (performance); others glow without casting light.
        lamp: z > -40 && (seed % 2 === 1 || z > -12),
        seed: seed++,
      });
    }
  }

  type Tree = { kind: "canopy" | "palm" | "banana" | "bush"; x: number; z: number; scale: number; seed: number };
  const trees: Tree[] = [];
  let ts = 100;
  // Palms and bananas between houses, close to the lane.
  for (const h of houses) {
    const [x, , z] = h.position;
    const side = Math.sign(x);
    trees.push({ kind: "palm", x: x + side * (4.5 + rnd() * 3), z: z + 5 + rnd() * 3, scale: 0.85 + rnd() * 0.35, seed: ts++ });
    trees.push({ kind: "banana", x: x - side * 1.5 + (rnd() - 0.5), z: z + 6.2 + rnd(), scale: 0.9 + rnd() * 0.4, seed: ts++ });
    if (rnd() < 0.7) trees.push({ kind: "banana", x: x + side * 1.2, z: z - 4.6 - rnd(), scale: 0.8 + rnd() * 0.3, seed: ts++ });
  }
  // Dense canopy behind the houses on both sides.
  for (let z = 14; z > -105; z -= 7 + rnd() * 4) {
    for (const side of [-1, 1]) {
      trees.push({ kind: "canopy", x: side * (17 + rnd() * 7), z: z + rnd() * 3, scale: 0.9 + rnd() * 0.5, seed: ts++ });
      if (rnd() < 0.6) trees.push({ kind: "palm", x: side * (21 + rnd() * 9), z: z - 3, scale: 1 + rnd() * 0.3, seed: ts++ });
    }
  }
  // Trees closing the near and far ends, so no edge of the world shows.
  for (let x = -26; x <= 26; x += 5 + rnd() * 3) trees.push({ kind: "canopy", x, z: 24 + rnd() * 8, scale: 1.1 + rnd() * 0.4, seed: ts++ });
  for (let x = -18; x <= 18; x += 7) trees.push({ kind: "palm", x: x + rnd() * 3, z: 19 + rnd() * 3, scale: 1, seed: ts++ });
  for (let x = -22; x <= 22; x += 6 + rnd() * 3) trees.push({ kind: "canopy", x, z: -82 - rnd() * 12, scale: 1.1 + rnd() * 0.5, seed: ts++ });
  // Bushes along the verges.
  for (let z = 10; z > -70; z -= 3 + rnd() * 4) {
    const side = rnd() < 0.5 ? -1 : 1;
    trees.push({ kind: "bush", x: side * (3.4 + rnd() * 1.4), z, scale: 0.7 + rnd() * 0.6, seed: ts++ });
  }

  const puddles: [number, number, number, number, number][] = [];
  for (let z = 10; z > -75; z -= 4 + rnd() * 6) puddles.push([(rnd() - 0.5) * 3, z, 1.2 + rnd() * 2.2, 0.8 + rnd() * 1.4, rnd() * 3]);

  const mist: Vec3[] = [];
  for (let z = 12; z > -95; z -= 6 + rnd() * 5) mist.push([(rnd() - 0.5) * 18, 0.9 + rnd() * 2.2, z]);
  for (let z = -20; z > -95; z -= 12) mist.push([(rnd() - 0.5) * 30, 5 + rnd() * 4, z]); // higher banks among the trees

  const laneWidth = 4.6;
  const objects: SceneObject[] = [
    { id: "ground", type: "lane-ground", size: [180, 220], lane: { width: laneWidth, from: 30, to: -110 } },
    { id: "lane-channel", type: "water-channel", x: -laneWidth / 2 - 0.1, from: 30, to: -80 },
    ...houses.map((h): SceneObject => {
      const { position, rotationY, seed: s, ...rest } = h;
      return { id: `house-${s}`, type: "house", position, rotation: [0, rotationY, 0], ...rest, seed: s };
    }),
    ...trees.map((t): SceneObject => ({ id: `tree-${t.seed}`, type: "tree", kind: t.kind, position: [t.x, 0, t.z], scale: t.scale, seed: t.seed })),
    ...puddles.map(([x, z, w, d, rot], i): SceneObject => ({ id: `puddle-${i + 1}`, type: "puddle", position: [x, 0, z], rotation: [0, rot, 0], size: [w, d] })),
  ];

  const path: Vec3[] = [
    [0.9, 1.55, 13],
    [-0.6, 1.5, 2],
    [0.7, 1.65, -10],
    [1.4, 2.4, -22],
    [-0.5, 5.2, -31],
    [-3.6, 4.4, -20],
    [-2.4, 2.4, -6],
    [-0.4, 1.7, 7],
  ];
  return {
    formatVersion: SCENE_FORMAT_VERSION,
    id: "monsoon-neighbourhood",
    title: "Monsoon neighbourhood",
    environment: {
      background: null,
      fog: { type: "exp2", color: "#5b6670", density: 0.026 },
      exposure: 1.35,
      sky: "monsoon-clouds",
      effects: { bloom: 1.05, bloomThreshold: 0.6, vignette: 0.5, grain: 0.05 },
      weather: {
        rain: { maxDrops: 9000 },
        mist: { strength: 0.75, banks: mist },
        lightning: { firstSeconds: 9, minSeconds: 12, maxSeconds: 30 },
      },
    },
    camera: {
      fov: 42,
      near: 0.1,
      far: 400,
      position: path[0],
      target: [0.9 * 0.35, 1, 13 - 15],
      path: { points: path, closed: true, loopSeconds: 95, lookAhead: 15 },
    },
    lights: [
      { id: "overcast-sky", type: "hemisphere", sky: "#8a9aa9", ground: "#3a3a2e", intensity: 1.25, flashBoost: 2.4 },
      {
        id: "key",
        type: "directional",
        position: [-18, 30, 10],
        color: "#9fb2c4",
        intensity: 0.75,
        flashBoost: 3.2,
        shadow: { mapSize: 2048, extent: 30, far: 90, bias: -0.0004 },
      },
    ],
    objects,
    audio: audioAnchors(houses),
    activities: activitySpots(houses),
    interactions: [],
    transitions: [],
  };
}

// ---------- living room (F1 blockout) -----------------------------------------------------

function livingRoom(): SceneDocument {
  const W = 5.2;
  const D = 4.6;
  const H = 3.0;
  const wall = { color: "#cdb994", roughness: 0.9 };
  // Left wall with a window opening: four panels around it ([centre z, centre y, width, height]).
  const [wx, wy, ww, wh] = [-0.4, 1.6, 1.4, 1.3];
  const panels: [number, number, number, number][] = [
    [(-D / 2 + (wx - ww / 2)) / 2, H / 2, wx - ww / 2 + D / 2, H],
    [(D / 2 + (wx + ww / 2)) / 2, H / 2, D / 2 - (wx + ww / 2), H],
    [wx, (wy - wh / 2) / 2, ww, wy - wh / 2],
    [wx, (H + wy + wh / 2) / 2, ww, H - (wy + wh / 2)],
  ];
  const cabinetZ = -D / 2 + 0.45;
  return {
    formatVersion: SCENE_FORMAT_VERSION,
    id: "living-room",
    title: "1990s living room",
    environment: {
      background: "#1a1420",
      fog: { type: "linear", color: "#2a2030", near: 6, far: 14 },
      exposure: 1,
      sky: null,
      effects: null,
      weather: { rain: null, mist: null, lightning: null },
    },
    // Aimed at the origin, as the stage camera was before F2 (same framing).
    camera: { fov: 45, near: 0.05, far: 60, position: [0, 1.4, 4.2], target: [0, 0, 0] },
    lights: [
      { id: "fill", type: "hemisphere", sky: "#ffd9a8", ground: "#3a2a24", intensity: 0.35 },
      { id: "bulb", type: "point", position: [0.6, 2.6, 0.4], color: "#ffb86b", intensity: 9, distance: 9, decay: 2, shadow: { mapSize: 1024 } },
      {
        id: "window-light",
        type: "spot",
        position: [-W / 2 - 1.5, 2.4, -0.4],
        target: [0, 0, 0],
        color: "#9fb6d8",
        intensity: 12,
        distance: 10,
        decay: 2,
        angle: 0.6,
        penumbra: 0.8,
      },
    ],
    objects: [
      { id: "floor", type: "plane", position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], size: [W, D], material: { color: "#8a6f5a", roughness: 0.55 }, receiveShadow: true },
      { id: "ceiling", type: "plane", position: [0, H, 0], rotation: [Math.PI / 2, 0, 0], size: [W, D], material: { color: "#e9dcc4", roughness: 0.95 } },
      { id: "back-wall", type: "plane", position: [0, H / 2, -D / 2], size: [W, H], material: { color: "#d9c7a3", roughness: 0.9 }, receiveShadow: true },
      { id: "right-wall", type: "plane", position: [W / 2, H / 2, 0], rotation: [0, -Math.PI / 2, 0], size: [D, H], material: wall, receiveShadow: true },
      ...panels.map(
        ([z, y, w, h], i): SceneObject => ({ id: `window-wall-${i + 1}`, type: "plane", position: [-W / 2, y, z], rotation: [0, Math.PI / 2, 0], size: [w, h], material: wall, receiveShadow: true }),
      ),
      { id: "window-glow", type: "plane", position: [-W / 2 + 0.02, 1.6, -0.4], rotation: [0, Math.PI / 2, 0], size: [1.4, 1.3], material: { color: "#5f7898", unlit: true } },
      { id: "ceiling-fan", type: "ceiling-fan", position: [0, H, 0.2], speed: 4.2 },
      { id: "tv-cabinet", type: "box", position: [0, 0.38, cabinetZ], size: [1.3, 0.76, 0.55], material: { color: "#5a3a22", roughness: 0.6 }, castShadow: true, receiveShadow: true },
      { id: "television", type: "model", asset: "television-01", position: [0, 0.76, cabinetZ] },
      { id: "brass-vase", type: "model", asset: "brass-vase-03", position: [0.5, 0.76, cabinetZ + 0.05] },
      { id: "chair", type: "model", asset: "monobloc-chair-01", position: [1.45, 0, -0.2], rotation: [0, -0.9, 0] },
    ],
    audio: [],
    activities: [],
    interactions: [],
    transitions: [],
  };
}

// ---------- validate and write ------------------------------------------------------------

const manifest = JSON.parse(readFileSync("content/assets/manifest.json", "utf8")) as { assets: { id: string; kind: string }[] };
const known = {
  models: new Set(manifest.assets.filter((a) => a.kind === "model").map((a) => a.id)),
  textures: new Set(manifest.assets.filter((a) => a.kind === "texture").map((a) => a.id)),
};
mkdirSync("content/scenes", { recursive: true });
for (const doc of [monsoon(), livingRoom()]) {
  const text = serializeScene(parseScene(JSON.parse(serializeScene(doc)), known));
  const out = `content/scenes/${doc.id}.json`;
  writeFileSync(out, text);
  console.log(`Wrote ${out} (${doc.objects.length} objects, ${Math.round(text.length / 1024)} KB)`);
}
