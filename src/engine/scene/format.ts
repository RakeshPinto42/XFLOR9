/**
 * F2 — the XPLOR9 scene format: one versioned JSON document per scene, shared by the site and
 * (later) the Cinematic Studio. The renderer only reads and draws it.
 *
 * Plain TypeScript, no three.js: the Studio, scripts and tests can all import it.
 * Scene files are treated as UNTRUSTED input (the Studio will produce them): every field is
 * checked, unknown fields are refused, numbers must be finite and in range, assets are referenced
 * only by id from the asset manifest, and no string may carry a URL or a path.
 */

export const SCENE_FORMAT_VERSION = 1;

/** Limits that keep a malformed or hostile file from exhausting the browser. */
export const SCENE_LIMITS = {
  maxBytes: 2_000_000,
  maxObjects: 5_000,
  maxListItems: 2_000,
  maxCoordinate: 10_000,
  maxTextLength: 500,
} as const;

// ---------- types -------------------------------------------------------------------------------

export type Vec3 = [number, number, number];
export type Colour = string; // "#rrggbb"

export interface Material {
  color: Colour;
  roughness?: number;
  metalness?: number;
  /** Ignores lighting (glowing windows, screens). */
  unlit?: boolean;
}

interface Placed {
  id: string;
  position: Vec3;
  /** Euler angles in radians (X, Y, Z order). */
  rotation?: Vec3;
  /** Uniform scale (1 = as modelled). */
  scale?: number;
}

export interface ModelObject extends Placed {
  type: "model";
  /** Model id from the asset manifest. */
  asset: string;
}

export interface BoxObject extends Placed {
  type: "box";
  size: Vec3;
  material: Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface PlaneObject extends Placed {
  type: "plane";
  size: [number, number];
  material: Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** A three-blade ceiling fan turning at `speed` radians per second. */
export interface CeilingFanObject extends Placed {
  type: "ceiling-fan";
  speed: number;
}

/** Ground with a muddy lane and grassy verges, centred on the origin, lane along Z. */
export interface LaneGroundObject {
  id: string;
  type: "lane-ground";
  size: [number, number];
  lane: { width: number; from: number; to: number };
}

/** Rainwater flowing along a shallow channel at x, from z = `from` to z = `to`. */
export interface WaterChannelObject {
  id: string;
  type: "water-channel";
  x: number;
  from: number;
  to: number;
}

/** A traditional tiled-roof house with a veranda facing local +Z. */
export interface HouseObject extends Placed {
  type: "house";
  width: number;
  depth: number;
  /** Wall texture set id from the asset manifest (one of HOUSE_WALLS). */
  wall: (typeof HOUSE_WALLS)[number];
  tint: Colour;
  /** Painted lower band of the wall, or null. */
  band: Colour | null;
  door: Colour;
  roofPitch: number;
  veranda: number;
  windows: 2 | 3;
  doorOpen: boolean;
  /** A veranda bulb that really lights its surroundings (costly: use on a few houses). */
  lamp: boolean;
  tulsi: boolean;
  /** Seed for small variations (shutter angles). */
  seed: number;
}

/** Wall texture sets the house kit can draw. */
export const HOUSE_WALLS = ["mossy-plaster", "yellow-plaster"] as const;

export type TreeKind = "canopy" | "palm" | "banana" | "bush";
export const TREE_KINDS: readonly TreeKind[] = ["canopy", "palm", "banana", "bush"];

export interface TreeObject extends Placed {
  type: "tree";
  kind: TreeKind;
  seed: number;
}

export interface PuddleObject extends Placed {
  type: "puddle";
  size: [number, number];
}

export type SceneObject =
  | ModelObject
  | BoxObject
  | PlaneObject
  | CeilingFanObject
  | LaneGroundObject
  | WaterChannelObject
  | HouseObject
  | TreeObject
  | PuddleObject;

export type HemisphereLight = { id: string; type: "hemisphere"; sky: Colour; ground: Colour; intensity: number; flashBoost?: number };
export type DirectionalLight = {
  id: string;
  type: "directional";
  position: Vec3;
  color: Colour;
  intensity: number;
  flashBoost?: number;
  /** Present = casts shadows (when the quality level allows). `extent` is the half-size of the shadow area. */
  shadow?: { mapSize: number; extent: number; far: number; bias: number };
};
export type PointLight = {
  id: string;
  type: "point";
  position: Vec3;
  color: Colour;
  intensity: number;
  distance: number;
  decay: number;
  shadow?: { mapSize: number };
};
export type SpotLight = {
  id: string;
  type: "spot";
  position: Vec3;
  target: Vec3;
  color: Colour;
  intensity: number;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
};
export type SceneLight = HemisphereLight | DirectionalLight | PointLight | SpotLight;

export interface SceneCamera {
  fov: number;
  near: number;
  far: number;
  position: Vec3;
  target: Vec3;
  /** A looping cinematic path (smooth curve through the points). */
  path?: { points: Vec3[]; closed: boolean; loopSeconds: number; lookAhead: number };
}

export interface SceneEnvironment {
  background: Colour | null;
  fog: { type: "exp2"; color: Colour; density: number } | { type: "linear"; color: Colour; near: number; far: number } | null;
  exposure: number;
  sky: "monsoon-clouds" | null;
  effects: { bloom: number; bloomThreshold: number; vignette: number; grain: number } | null;
  weather: {
    rain: { maxDrops: number } | null;
    mist: { strength: number; banks: Vec3[] } | null;
    lightning: { firstSeconds: number; minSeconds: number; maxSeconds: number } | null;
  };
}

export type AudioAnchorKind = "rain-on-tiles" | "eave-drips" | "distant-radio" | "birds-and-frogs" | "neighbourhood";
export const AUDIO_ANCHOR_KINDS: readonly AudioAnchorKind[] = ["rain-on-tiles", "eave-drips", "distant-radio", "birds-and-frogs", "neighbourhood"];

/** A sound source position for the A1 audio system. */
export interface AudioAnchor {
  id: string;
  kind: AudioAnchorKind;
  position: Vec3;
  /** Audible radius (metres). */
  radius: number;
}

export type ActivityKind = "cricket" | "football" | "marbles" | "reading" | "cycling" | "chatting";
export const ACTIVITY_KINDS: readonly ActivityKind[] = ["cricket", "football", "marbles", "reading", "cycling", "chatting"];

/** Where F4's characters will play, read and talk. */
export interface ActivitySpot {
  id: string;
  kind: ActivityKind;
  position: Vec3;
  /** Facing (radians around Y). */
  facing: number;
  /** Space the activity needs (metres). */
  radius: number;
  /** Number of characters the spot is designed for: [min, max]. */
  group: [number, number];
  /** Under a roof (sheltered from the rain). */
  sheltered: boolean;
  /** Waypoints for moving activities (cycling). */
  route?: Vec3[];
  note: string;
}

/** Placeholder until interactions are designed (F4/M phases): what can be used, and how. */
export interface SceneInteraction {
  id: string;
  kind: string;
  /** Id of an object in this scene. */
  target: string;
}

/** Placeholder until U2: moving from this scene to another. */
export interface SceneTransition {
  id: string;
  /** Id of the destination scene. */
  to: string;
  trigger: string;
}

export interface SceneDocument {
  formatVersion: typeof SCENE_FORMAT_VERSION;
  id: string;
  title: string;
  environment: SceneEnvironment;
  camera: SceneCamera;
  lights: SceneLight[];
  objects: SceneObject[];
  audio: AudioAnchor[];
  activities: ActivitySpot[];
  interactions: SceneInteraction[];
  transitions: SceneTransition[];
}

/** Asset ids a scene may reference (from the asset manifest). */
export interface KnownAssets {
  models: ReadonlySet<string>;
  textures: ReadonlySet<string>;
}

// ---------- errors, upgrades, parsing --------------------------------------------------------

export class SceneFormatError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Scene file is invalid:\n- ${problems.slice(0, 20).join("\n- ")}${problems.length > 20 ? `\n- …and ${problems.length - 20} more` : ""}`);
    this.problems = problems;
  }
}

type Json = Record<string, unknown>;
/** Converts a document of format N into format N + 1. */
export type SceneUpgrade = (doc: Json) => Json;

/**
 * The upgrade chain: UPGRADES[n] turns format n into n + 1. Empty while only format 1 exists;
 * every future format change adds a step here (and a test), so older files keep working.
 */
export const UPGRADES: Readonly<Record<number, SceneUpgrade>> = {};

/** Brings any supported older document up to `current`. Never mutates its input. */
export function upgradeScene(raw: unknown, upgrades: Readonly<Record<number, SceneUpgrade>> = UPGRADES, current: number = SCENE_FORMAT_VERSION): Json {
  if (!isRecord(raw)) throw new SceneFormatError(["the scene must be a JSON object"]);
  const version = raw.formatVersion;
  if (!Number.isInteger(version)) throw new SceneFormatError(["formatVersion must be a whole number"]);
  const v = version as number;
  if (v < 1) throw new SceneFormatError([`formatVersion ${v} does not exist (the first format is 1)`]);
  if (v > current) throw new SceneFormatError([`this scene uses format ${v}, made by a newer version of XPLOR9; this site reads up to format ${current}`]);
  let doc = structuredClone(raw) as Json;
  for (let n = v; n < current; n++) {
    const step = upgrades[n];
    if (!step) throw new SceneFormatError([`no upgrade from format ${n} to ${n + 1}`]);
    doc = step(doc);
    doc.formatVersion = n + 1;
  }
  return doc;
}

/** Parses scene JSON text (size-limited) into a validated document. */
export function parseSceneText(text: string, assets: KnownAssets): SceneDocument {
  if (text.length > SCENE_LIMITS.maxBytes) throw new SceneFormatError([`the file is too large (${text.length} characters; the limit is ${SCENE_LIMITS.maxBytes})`]);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SceneFormatError([`not valid JSON: ${e instanceof Error ? e.message : String(e)}`]);
  }
  return parseScene(raw, assets);
}

/** Upgrades and validates a scene document. Returns a copy; the input is never modified. */
export function parseScene(raw: unknown, assets: KnownAssets): SceneDocument {
  const doc = upgradeScene(raw);
  const c = new Checker(assets);
  c.document(doc);
  if (c.problems.length) throw new SceneFormatError(c.problems);
  return doc as unknown as SceneDocument;
}

/** The canonical text of a scene file: what the Studio writes and what is committed. */
export function serializeScene(doc: SceneDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------- validation -----------------------------------------------------------------------

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOUR = /^#[0-9a-f]{6}$/i;
/** URL schemes, protocol-relative URLs, paths and parent references are never allowed in text. */
const UNSAFE_TEXT = /(?:\b(?:https?|data|javascript|vbscript|blob|file|ftp|wss?):)|\/\/|\\|\.\.\/|^\//i;

function isRecord(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class Checker {
  problems: string[] = [];
  private ids = new Set<string>();
  private readonly assets: KnownAssets;
  constructor(assets: KnownAssets) {
    this.assets = assets;
  }

  private fail(at: string, msg: string) {
    this.problems.push(`${at}: ${msg}`);
  }

  /** Checks the object's fields: required ones present, no unknown ones. */
  private fields(at: string, v: unknown, required: string[], optional: string[] = []): v is Json {
    if (!isRecord(v)) {
      this.fail(at, "must be an object");
      return false;
    }
    for (const k of required) if (!(k in v)) this.fail(at, `${k} is required`);
    const allowed = new Set([...required, ...optional]);
    for (const k of Object.keys(v)) if (!allowed.has(k)) this.fail(at, `unknown field "${k}"`);
    return true;
  }

  private num(at: string, v: unknown, min: number, max: number) {
    if (typeof v !== "number" || !Number.isFinite(v)) return this.fail(at, "must be a number");
    if (v < min || v > max) this.fail(at, `must be between ${min} and ${max} (got ${v})`);
  }
  private int(at: string, v: unknown, min: number, max: number) {
    if (!Number.isInteger(v)) return this.fail(at, "must be a whole number");
    this.num(at, v, min, max);
  }
  private bool(at: string, v: unknown) {
    if (typeof v !== "boolean") this.fail(at, "must be true or false");
  }
  private colour(at: string, v: unknown) {
    if (typeof v !== "string" || !COLOUR.test(v)) this.fail(at, 'must be a colour like "#a1b2c3"');
  }
  private oneOf(at: string, v: unknown, options: readonly string[]) {
    if (typeof v !== "string" || !options.includes(v)) this.fail(at, `must be one of: ${options.join(", ")}`);
  }
  private text(at: string, v: unknown) {
    if (typeof v !== "string" || !v.trim()) return this.fail(at, "must be non-empty text");
    if (v.length > SCENE_LIMITS.maxTextLength) this.fail(at, `is too long (limit ${SCENE_LIMITS.maxTextLength} characters)`);
    if (UNSAFE_TEXT.test(v)) this.fail(at, "must not contain a link or file path");
  }
  private slug(at: string, v: unknown) {
    if (typeof v !== "string" || !ID.test(v) || v.length > 80) this.fail(at, "must be a lowercase id like house-1");
  }
  /** A unique id within the document. */
  private id(at: string, v: unknown) {
    this.slug(`${at}.id`, v);
    if (typeof v === "string") {
      if (this.ids.has(v)) this.fail(`${at}.id`, `"${v}" is used more than once`);
      this.ids.add(v);
    }
  }
  private vec3(at: string, v: unknown, max: number = SCENE_LIMITS.maxCoordinate) {
    if (!Array.isArray(v) || v.length !== 3) return this.fail(at, "must be [x, y, z]");
    v.forEach((n, i) => this.num(`${at}[${i}]`, n, -max, max));
  }
  private pair(at: string, v: unknown, min: number, max: number) {
    if (!Array.isArray(v) || v.length !== 2) return this.fail(at, "must be [a, b]");
    v.forEach((n, i) => this.num(`${at}[${i}]`, n, min, max));
  }
  private list(at: string, v: unknown, max: number = SCENE_LIMITS.maxListItems): v is unknown[] {
    if (!Array.isArray(v)) {
      this.fail(at, "must be a list");
      return false;
    }
    if (v.length > max) {
      this.fail(at, `has ${v.length} items (the limit is ${max})`);
      return false;
    }
    return true;
  }
  private asset(at: string, v: unknown, kind: "model" | "texture") {
    this.slug(at, v);
    const known = kind === "model" ? this.assets.models : this.assets.textures;
    if (typeof v === "string" && ID.test(v) && !known.has(v)) this.fail(at, `"${v}" is not a ${kind === "model" ? "model" : "texture set"} in the asset manifest`);
  }

  document(d: Json) {
    const keys = ["formatVersion", "id", "title", "environment", "camera", "lights", "objects", "audio", "activities", "interactions", "transitions"];
    if (!this.fields("scene", d, keys)) return;
    this.slug("id", d.id);
    this.text("title", d.title);
    this.environment(d.environment);
    this.camera(d.camera);
    if (this.list("lights", d.lights, 64)) d.lights.forEach((l, i) => this.light(`lights[${i}]`, l));
    if (this.list("objects", d.objects, SCENE_LIMITS.maxObjects)) d.objects.forEach((o, i) => this.object(`objects[${i}]`, o));
    if (this.list("audio", d.audio)) d.audio.forEach((a, i) => this.audio(`audio[${i}]`, a));
    if (this.list("activities", d.activities)) d.activities.forEach((a, i) => this.activity(`activities[${i}]`, a));
    const objectIds = new Set(Array.isArray(d.objects) ? d.objects.map((o) => (isRecord(o) ? o.id : null)) : []);
    if (this.list("interactions", d.interactions))
      d.interactions.forEach((x, i) => {
        const at = `interactions[${i}]`;
        if (!this.fields(at, x, ["id", "kind", "target"])) return;
        this.id(at, x.id);
        this.slug(`${at}.kind`, x.kind);
        if (!objectIds.has(x.target)) this.fail(`${at}.target`, "must be the id of an object in this scene");
      });
    if (this.list("transitions", d.transitions))
      d.transitions.forEach((x, i) => {
        const at = `transitions[${i}]`;
        if (!this.fields(at, x, ["id", "to", "trigger"])) return;
        this.id(at, x.id);
        this.slug(`${at}.to`, x.to);
        this.slug(`${at}.trigger`, x.trigger);
      });
  }

  environment(e: unknown) {
    const at = "environment";
    if (!this.fields(at, e, ["background", "fog", "exposure", "sky", "effects", "weather"])) return;
    if (e.background !== null) this.colour(`${at}.background`, e.background);
    if (e.fog !== null) {
      const f = e.fog;
      if (isRecord(f) && f.type === "exp2") {
        if (this.fields(`${at}.fog`, f, ["type", "color", "density"])) {
          this.colour(`${at}.fog.color`, f.color);
          this.num(`${at}.fog.density`, f.density, 0, 1);
        }
      } else if (isRecord(f) && f.type === "linear") {
        if (this.fields(`${at}.fog`, f, ["type", "color", "near", "far"])) {
          this.colour(`${at}.fog.color`, f.color);
          this.num(`${at}.fog.near`, f.near, 0, 10_000);
          this.num(`${at}.fog.far`, f.far, 0, 10_000);
          if (typeof f.near === "number" && typeof f.far === "number" && f.far <= f.near) this.fail(`${at}.fog`, "far must be beyond near");
        }
      } else this.fail(`${at}.fog`, 'must be null or have type "exp2" or "linear"');
    }
    this.num(`${at}.exposure`, e.exposure, 0.05, 8);
    if (e.sky !== null) this.oneOf(`${at}.sky`, e.sky, ["monsoon-clouds"]);
    if (e.effects !== null && this.fields(`${at}.effects`, e.effects, ["bloom", "bloomThreshold", "vignette", "grain"])) {
      const fx = e.effects as Json;
      this.num(`${at}.effects.bloom`, fx.bloom, 0, 5);
      this.num(`${at}.effects.bloomThreshold`, fx.bloomThreshold, 0, 1);
      this.num(`${at}.effects.vignette`, fx.vignette, 0, 1);
      this.num(`${at}.effects.grain`, fx.grain, 0, 1);
    }
    const w = e.weather;
    if (!this.fields(`${at}.weather`, w, ["rain", "mist", "lightning"])) return;
    if (w.rain !== null && this.fields(`${at}.weather.rain`, w.rain, ["maxDrops"])) this.int(`${at}.weather.rain.maxDrops`, (w.rain as Json).maxDrops, 0, 50_000);
    if (w.mist !== null && this.fields(`${at}.weather.mist`, w.mist, ["strength", "banks"])) {
      const m = w.mist as Json;
      this.num(`${at}.weather.mist.strength`, m.strength, 0, 1);
      if (this.list(`${at}.weather.mist.banks`, m.banks, 256)) m.banks.forEach((b, i) => this.vec3(`${at}.weather.mist.banks[${i}]`, b));
    }
    if (w.lightning !== null && this.fields(`${at}.weather.lightning`, w.lightning, ["firstSeconds", "minSeconds", "maxSeconds"])) {
      const l = w.lightning as Json;
      this.num(`${at}.weather.lightning.firstSeconds`, l.firstSeconds, 0, 3600);
      this.num(`${at}.weather.lightning.minSeconds`, l.minSeconds, 1, 3600);
      this.num(`${at}.weather.lightning.maxSeconds`, l.maxSeconds, 1, 3600);
      if (typeof l.minSeconds === "number" && typeof l.maxSeconds === "number" && l.maxSeconds < l.minSeconds) this.fail(`${at}.weather.lightning`, "maxSeconds must not be below minSeconds");
    }
  }

  camera(c: unknown) {
    if (!this.fields("camera", c, ["fov", "near", "far", "position", "target"], ["path"])) return;
    this.num("camera.fov", c.fov, 5, 150);
    this.num("camera.near", c.near, 0.001, 100);
    this.num("camera.far", c.far, 1, 100_000);
    if (typeof c.near === "number" && typeof c.far === "number" && c.far <= c.near) this.fail("camera", "far must be beyond near");
    this.vec3("camera.position", c.position);
    this.vec3("camera.target", c.target);
    if (c.path === undefined) return;
    const p = c.path;
    if (!this.fields("camera.path", p, ["points", "closed", "loopSeconds", "lookAhead"])) return;
    if (this.list("camera.path.points", p.points, 256)) {
      if (p.points.length < 2) this.fail("camera.path.points", "needs at least 2 points");
      p.points.forEach((pt, i) => this.vec3(`camera.path.points[${i}]`, pt));
    }
    this.bool("camera.path.closed", p.closed);
    this.num("camera.path.loopSeconds", p.loopSeconds, 1, 36_000);
    this.num("camera.path.lookAhead", p.lookAhead, 0, 1000);
  }

  light(at: string, l: unknown) {
    if (!isRecord(l)) return this.fail(at, "must be an object");
    const intensity = () => this.num(`${at}.intensity`, l.intensity, 0, 10_000);
    switch (l.type) {
      case "hemisphere":
        if (!this.fields(at, l, ["id", "type", "sky", "ground", "intensity"], ["flashBoost"])) return;
        this.id(at, l.id);
        this.colour(`${at}.sky`, l.sky);
        this.colour(`${at}.ground`, l.ground);
        intensity();
        if (l.flashBoost !== undefined) this.num(`${at}.flashBoost`, l.flashBoost, 0, 100);
        return;
      case "directional":
        if (!this.fields(at, l, ["id", "type", "position", "color", "intensity"], ["flashBoost", "shadow"])) return;
        this.id(at, l.id);
        this.vec3(`${at}.position`, l.position);
        this.colour(`${at}.color`, l.color);
        intensity();
        if (l.flashBoost !== undefined) this.num(`${at}.flashBoost`, l.flashBoost, 0, 100);
        if (l.shadow !== undefined && this.fields(`${at}.shadow`, l.shadow, ["mapSize", "extent", "far", "bias"])) {
          const s = l.shadow as Json;
          this.oneOf(`${at}.shadow.mapSize`, String(s.mapSize), ["256", "512", "1024", "2048", "4096"]);
          this.num(`${at}.shadow.extent`, s.extent, 0.1, 1000);
          this.num(`${at}.shadow.far`, s.far, 0.1, 10_000);
          this.num(`${at}.shadow.bias`, s.bias, -0.1, 0.1);
        }
        return;
      case "point":
        if (!this.fields(at, l, ["id", "type", "position", "color", "intensity", "distance", "decay"], ["shadow"])) return;
        this.id(at, l.id);
        this.vec3(`${at}.position`, l.position);
        this.colour(`${at}.color`, l.color);
        intensity();
        this.num(`${at}.distance`, l.distance, 0, 10_000);
        this.num(`${at}.decay`, l.decay, 0, 10);
        if (l.shadow !== undefined && this.fields(`${at}.shadow`, l.shadow, ["mapSize"])) this.oneOf(`${at}.shadow.mapSize`, String((l.shadow as Json).mapSize), ["256", "512", "1024", "2048"]);
        return;
      case "spot":
        if (!this.fields(at, l, ["id", "type", "position", "target", "color", "intensity", "distance", "decay", "angle", "penumbra"])) return;
        this.id(at, l.id);
        this.vec3(`${at}.position`, l.position);
        this.vec3(`${at}.target`, l.target);
        this.colour(`${at}.color`, l.color);
        intensity();
        this.num(`${at}.distance`, l.distance, 0, 10_000);
        this.num(`${at}.decay`, l.decay, 0, 10);
        this.num(`${at}.angle`, l.angle, 0, Math.PI / 2);
        this.num(`${at}.penumbra`, l.penumbra, 0, 1);
        return;
      default:
        this.fail(`${at}.type`, "must be hemisphere, directional, point or spot");
    }
  }

  /** Common placement fields; returns the object's label for messages. */
  private placed(at: string, o: Json) {
    this.id(at, o.id);
    this.vec3(`${at}.position`, o.position);
    if (o.rotation !== undefined) this.vec3(`${at}.rotation`, o.rotation, 100);
    if (o.scale !== undefined) this.num(`${at}.scale`, o.scale, 0.001, 1000);
  }

  object(at0: string, o: unknown) {
    if (!isRecord(o)) return this.fail(at0, "must be an object");
    const at = typeof o.id === "string" ? `${at0} (${o.id})` : at0;
    const placed = ["id", "type", "position"];
    const transform = ["rotation", "scale"];
    switch (o.type) {
      case "model":
        if (!this.fields(at, o, [...placed, "asset"], transform)) return;
        this.placed(at, o);
        this.asset(`${at}.asset`, o.asset, "model");
        return;
      case "box":
      case "plane":
        if (!this.fields(at, o, [...placed, "size", "material"], [...transform, "castShadow", "receiveShadow"])) return;
        this.placed(at, o);
        if (o.type === "box") {
          this.vec3(`${at}.size`, o.size);
          if (Array.isArray(o.size) && o.size.some((n) => typeof n === "number" && n <= 0)) this.fail(`${at}.size`, "must be positive");
        } else this.pair(`${at}.size`, o.size, 0.0001, SCENE_LIMITS.maxCoordinate);
        this.material(`${at}.material`, o.material);
        if (o.castShadow !== undefined) this.bool(`${at}.castShadow`, o.castShadow);
        if (o.receiveShadow !== undefined) this.bool(`${at}.receiveShadow`, o.receiveShadow);
        return;
      case "ceiling-fan":
        if (!this.fields(at, o, [...placed, "speed"], transform)) return;
        this.placed(at, o);
        this.num(`${at}.speed`, o.speed, -50, 50);
        return;
      case "lane-ground":
        if (!this.fields(at, o, ["id", "type", "size", "lane"])) return;
        this.id(at, o.id);
        this.pair(`${at}.size`, o.size, 1, SCENE_LIMITS.maxCoordinate);
        if (this.fields(`${at}.lane`, o.lane, ["width", "from", "to"])) {
          const lane = o.lane as Json;
          this.num(`${at}.lane.width`, lane.width, 0.5, 100);
          this.num(`${at}.lane.from`, lane.from, -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate);
          this.num(`${at}.lane.to`, lane.to, -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate);
          if (typeof lane.from === "number" && typeof lane.to === "number" && lane.to >= lane.from) this.fail(`${at}.lane`, "runs from larger z to smaller z (to must be below from)");
        }
        return;
      case "water-channel":
        if (!this.fields(at, o, ["id", "type", "x", "from", "to"])) return;
        this.id(at, o.id);
        for (const k of ["x", "from", "to"]) this.num(`${at}.${k}`, o[k], -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate);
        if (typeof o.from === "number" && typeof o.to === "number" && o.to >= o.from) this.fail(at, "to must be below from");
        return;
      case "house": {
        const keys = ["width", "depth", "wall", "tint", "band", "door", "roofPitch", "veranda", "windows", "doorOpen", "lamp", "tulsi", "seed"];
        if (!this.fields(at, o, [...placed, ...keys], transform)) return;
        this.placed(at, o);
        this.num(`${at}.width`, o.width, 3, 30);
        this.num(`${at}.depth`, o.depth, 3, 30);
        this.oneOf(`${at}.wall`, o.wall, HOUSE_WALLS);
        this.asset(`${at}.wall`, o.wall, "texture");
        this.colour(`${at}.tint`, o.tint);
        if (o.band !== null) this.colour(`${at}.band`, o.band);
        this.colour(`${at}.door`, o.door);
        this.num(`${at}.roofPitch`, o.roofPitch, 0.3, 5);
        this.num(`${at}.veranda`, o.veranda, 0.5, 6);
        if (o.windows !== 2 && o.windows !== 3) this.fail(`${at}.windows`, "must be 2 or 3");
        for (const k of ["doorOpen", "lamp", "tulsi"]) this.bool(`${at}.${k}`, o[k]);
        this.int(`${at}.seed`, o.seed, 0, 1_000_000);
        return;
      }
      case "tree":
        if (!this.fields(at, o, [...placed, "kind", "seed"], transform)) return;
        this.placed(at, o);
        this.oneOf(`${at}.kind`, o.kind, TREE_KINDS);
        this.int(`${at}.seed`, o.seed, 0, 1_000_000);
        return;
      case "puddle":
        if (!this.fields(at, o, [...placed, "size"], transform)) return;
        this.placed(at, o);
        this.pair(`${at}.size`, o.size, 0.05, 100);
        return;
      default:
        this.fail(`${at}.type`, "is not a known object type");
    }
  }

  material(at: string, m: unknown) {
    if (!this.fields(at, m, ["color"], ["roughness", "metalness", "unlit"])) return;
    this.colour(`${at}.color`, m.color);
    if (m.roughness !== undefined) this.num(`${at}.roughness`, m.roughness, 0, 1);
    if (m.metalness !== undefined) this.num(`${at}.metalness`, m.metalness, 0, 1);
    if (m.unlit !== undefined) this.bool(`${at}.unlit`, m.unlit);
  }

  audio(at: string, a: unknown) {
    if (!this.fields(at, a, ["id", "kind", "position", "radius"])) return;
    this.id(at, a.id);
    this.oneOf(`${at}.kind`, a.kind, AUDIO_ANCHOR_KINDS);
    this.vec3(`${at}.position`, a.position);
    this.num(`${at}.radius`, a.radius, 0.1, 1000);
  }

  activity(at: string, a: unknown) {
    if (!this.fields(at, a, ["id", "kind", "position", "facing", "radius", "group", "sheltered", "note"], ["route"])) return;
    this.id(at, a.id);
    this.oneOf(`${at}.kind`, a.kind, ACTIVITY_KINDS);
    this.vec3(`${at}.position`, a.position);
    this.num(`${at}.facing`, a.facing, -100, 100);
    this.num(`${at}.radius`, a.radius, 0.1, 100);
    this.pair(`${at}.group`, a.group, 1, 50);
    if (Array.isArray(a.group) && a.group[0] > a.group[1]) this.fail(`${at}.group`, "minimum must not exceed maximum");
    this.bool(`${at}.sheltered`, a.sheltered);
    if (a.route !== undefined && this.list(`${at}.route`, a.route, 256)) a.route.forEach((p, i) => this.vec3(`${at}.route[${i}]`, p));
    this.text(`${at}.note`, a.note);
  }
}
