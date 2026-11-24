import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../../content/assets/manifest.json";
import { parseScene, parseSceneText, SCENE_FORMAT_VERSION, SCENE_LIMITS, SceneFormatError, serializeScene, upgradeScene, type KnownAssets, type SceneDocument } from "./format";

const known: KnownAssets = {
  models: new Set(manifest.assets.filter((a) => a.kind === "model").map((a) => a.id)),
  textures: new Set(manifest.assets.filter((a) => a.kind === "texture").map((a) => a.id)),
};
const SCENES = ["monsoon-neighbourhood", "living-room"];
const fileText = (id: string) => readFileSync(`content/scenes/${id}.json`, "utf8");

/** A small valid scene to break in specific ways. */
function minimal(): SceneDocument {
  return {
    formatVersion: SCENE_FORMAT_VERSION,
    id: "test-scene",
    title: "Test scene",
    environment: { background: "#101010", fog: null, exposure: 1, sky: null, effects: null, weather: { rain: null, mist: null, lightning: null } },
    camera: { fov: 45, near: 0.1, far: 100, position: [0, 1.5, 5], target: [0, 1, 0], modes: ["cinematic", "first-person"], startMode: "cinematic" },
    lights: [{ id: "sun", type: "directional", position: [5, 10, 5], color: "#ffffff", intensity: 1 }],
    objects: [
      { id: "floor", type: "plane", position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], size: [4, 4], material: { color: "#888888" } },
      { id: "tv", type: "model", asset: "television-01", position: [0, 0, 0] },
    ],
    audio: [],
    activities: [],
    interactions: [{ id: "switch-on-tv", kind: "use", target: "tv" }],
    transitions: [],
  };
}

/** Parses, expecting failure; returns the list of problems. */
function problems(raw: unknown): string[] {
  try {
    parseScene(raw, known);
  } catch (e) {
    if (e instanceof SceneFormatError) return e.problems;
    throw e;
  }
  throw new Error("expected the scene to be rejected");
}

/* eslint-disable @typescript-eslint/no-explicit-any -- tests build deliberately malformed input */
const mutate = (fn: (d: Record<string, any>) => void) => {
  const d = structuredClone(minimal()) as Record<string, any>;
  fn(d);
  return d;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("shipped scene files", () => {
  it.each(SCENES)("%s is valid against the real asset manifest", (id) => {
    const doc = parseSceneText(fileText(id), known);
    expect(doc.id).toBe(id);
    expect(doc.formatVersion).toBe(SCENE_FORMAT_VERSION);
  });
  it.each(SCENES)("%s round-trips byte for byte (load then save gives the identical file)", (id) => {
    const text = fileText(id).replace(/\r\n/g, "\n");
    expect(serializeScene(parseSceneText(text, known))).toBe(text);
  });
  it("the monsoon file carries its houses, trees, activity locations and sound positions", () => {
    const doc = parseSceneText(fileText("monsoon-neighbourhood"), known);
    const count = (t: string) => doc.objects.filter((o) => o.type === t).length;
    expect(count("house")).toBe(10);
    expect(count("tree")).toBeGreaterThan(50);
    expect(doc.activities.length).toBeGreaterThan(5);
    expect(doc.audio.filter((a) => a.kind === "rain-on-tiles")).toHaveLength(10);
  });
});

describe("validation", () => {
  it("accepts a minimal scene and returns a copy (input untouched)", () => {
    const input = minimal();
    const doc = parseScene(input, known);
    expect(doc).toEqual(input);
    expect(doc).not.toBe(input);
  });
  it("names the exact field that is wrong", () => {
    expect(problems(mutate((d) => (d.objects[0].size = [4, -1])))).toEqual(["objects[0] (floor).size[1]: must be between 0.0001 and 10000 (got -1)"]);
    expect(problems(mutate((d) => (d.lights[0].color = "white")))).toEqual(['lights[0].color: must be a colour like "#a1b2c3"']);
  });
  it("refuses unknown fields and missing required ones", () => {
    expect(problems(mutate((d) => (d.objects[0].onClick = "x")))).toContain('objects[0] (floor): unknown field "onClick"');
    expect(problems(mutate((d) => delete d.camera.fov))).toContain("camera: fov is required");
    expect(problems(mutate((d) => (d.extra = 1)))).toContain('scene: unknown field "extra"');
  });
  it("refuses non-finite and out-of-range numbers", () => {
    expect(problems(mutate((d) => (d.objects[0].position = [0, Number.NaN, 0])))).toContain("objects[0] (floor).position[1]: must be a number");
    expect(problems(mutate((d) => (d.objects[0].position = [1e9, 0, 0])))).toContain("objects[0] (floor).position[0]: must be between -10000 and 10000 (got 1000000000)");
    expect(problems(mutate((d) => (d.camera.far = 0.05)))).toEqual(expect.arrayContaining(["camera: far must be beyond near"]));
  });
  it("checks the camera's visitor modes (format 2)", () => {
    expect(problems(mutate((d) => (d.camera.modes = [])))).toContain("camera.modes: needs at least one mode");
    expect(problems(mutate((d) => (d.camera.modes = ["cinematic", "free"])))).toContain(
      "camera.modes[1]: must be one of: cinematic, isometric, top-down, third-person, first-person",
    );
    expect(problems(mutate((d) => (d.camera.modes = ["cinematic", "cinematic"])))).toContain("camera.modes: lists a mode twice");
    expect(problems(mutate((d) => (d.camera.startMode = "top-down")))).toContain("camera.startMode: must be one of the scene's modes");
    expect(problems(mutate((d) => delete d.camera.startMode))).toContain("camera: startMode is required");
  });
  it("refuses assets that are not in the manifest, or of the wrong kind", () => {
    expect(problems(mutate((d) => (d.objects[1].asset = "not-a-model")))).toContain('objects[1] (tv).asset: "not-a-model" is not a model in the asset manifest');
    expect(problems(mutate((d) => (d.objects[1].asset = "clay-roof-tiles")))).toContain('objects[1] (tv).asset: "clay-roof-tiles" is not a model in the asset manifest');
  });
  it("never lets a URL or file path in", () => {
    expect(problems(mutate((d) => (d.objects[1].asset = "https://evil.example/x.glb")))).toContain("objects[1] (tv).asset: must be a lowercase id like house-1");
    expect(problems(mutate((d) => (d.title = "see https://evil.example")))).toContain("title: must not contain a link or file path");
    expect(problems(mutate((d) => (d.title = "javascript:alert(1)")))).toContain("title: must not contain a link or file path");
    expect(problems(mutate((d) => (d.title = "../../secrets")))).toContain("title: must not contain a link or file path");
    expect(problems(mutate((d) => (d.title = "/etc/passwd")))).toContain("title: must not contain a link or file path");
  });
  it("refuses duplicate ids and interactions aimed at objects that don't exist", () => {
    expect(problems(mutate((d) => (d.objects[1].id = "floor")))).toContain('objects[1] (floor).id: "floor" is used more than once');
    expect(problems(mutate((d) => (d.interactions[0].target = "nothing")))).toContain("interactions[0].target: must be the id of an object in this scene");
  });
  it("refuses unknown object and light types", () => {
    expect(problems(mutate((d) => (d.objects[0].type = "script")))).toContain("objects[0] (floor).type: is not a known object type");
    expect(problems(mutate((d) => (d.lights[0].type = "laser")))).toContain("lights[0].type: must be hemisphere, directional, point or spot");
  });
  it("limits size and counts", () => {
    expect(() => parseSceneText(" ".repeat(SCENE_LIMITS.maxBytes + 1), known)).toThrow(/too large/);
    expect(() => parseSceneText("{ not json", known)).toThrow(/not valid JSON/);
    const many = mutate((d) => (d.objects = Array.from({ length: SCENE_LIMITS.maxObjects + 1 }, (_, i) => ({ ...d.objects[0], id: `p-${i}` }))));
    expect(problems(many)).toContain(`objects: has ${SCENE_LIMITS.maxObjects + 1} items (the limit is ${SCENE_LIMITS.maxObjects})`);
  });
  it("refuses a house with a wall texture the house kit can't draw", () => {
    const doc = JSON.parse(fileText("monsoon-neighbourhood"));
    const house = doc.objects.find((o: { type: string }) => o.type === "house");
    house.wall = "clay-roof-tiles";
    expect(problems(doc)).toContain(`objects[${doc.objects.indexOf(house)}] (${house.id}).wall: must be one of: mossy-plaster, yellow-plaster`);
  });
});

describe("format versions and upgrades", () => {
  it("refuses files without a version, from the future, or below 1", () => {
    expect(problems(mutate((d) => delete d.formatVersion))).toEqual(["formatVersion must be a whole number"]);
    expect(problems(mutate((d) => (d.formatVersion = SCENE_FORMAT_VERSION + 1)))).toEqual([
      `this scene uses format ${SCENE_FORMAT_VERSION + 1}, made by a newer version of XPLOR9; this site reads up to format ${SCENE_FORMAT_VERSION}`,
    ]);
    expect(problems(mutate((d) => (d.formatVersion = 0)))).toEqual(["formatVersion 0 does not exist (the first format is 1)"]);
  });
  it("upgrades a format 1 file: its camera gets the cinematic mode", () => {
    const v1 = mutate((d) => {
      d.formatVersion = 1;
      delete d.camera.modes;
      delete d.camera.startMode;
    });
    const out = parseScene(v1, known);
    expect(out.formatVersion).toBe(2);
    expect(out.camera).toMatchObject({ modes: ["cinematic"], startMode: "cinematic" });
  });
  // The chain itself, exercised with test upgrades: the mechanism every format change uses.
  it("applies each upgrade step in order and stamps the new version", () => {
    const steps = {
      1: (d: Record<string, unknown>) => ({ ...d, renamed: d.title, title: undefined }),
      2: (d: Record<string, unknown>) => ({ ...d, addedInThree: true }),
    };
    const out = upgradeScene({ formatVersion: 1, title: "Old" }, steps, 3);
    expect(out).toEqual({ formatVersion: 3, renamed: "Old", title: undefined, addedInThree: true });
  });
  it("reports a missing upgrade step instead of guessing", () => {
    expect(() => upgradeScene({ formatVersion: 1 }, {}, 2)).toThrow(/no upgrade from format 1 to 2/);
  });
  it("never modifies the input document", () => {
    const input = { formatVersion: 1, nested: { a: 1 } };
    upgradeScene(input, { 1: (d) => (((d.nested as { a: number }).a = 2), d) }, 2);
    expect(input.nested.a).toBe(1);
  });
});
