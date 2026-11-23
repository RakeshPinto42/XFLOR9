"use client";

import { useMemo } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useTextureSet, worldBox, worldPlane } from "@/stage/textures";
import { atmosphere, seeded } from "./atmosphere";
import { fogUniforms } from "./ground";

/**
 * Traditional tiled-roof houses with verandas. Every house is generated from a spec, then ALL
 * houses' parts are merged per material (walls, roofs, wood, doors, glowing windows, iron bars,
 * bulbs): a handful of draw calls for the whole street instead of ~40 per house. Per-house colour
 * variation survives the merge as vertex colours.
 */

export interface HouseSpec {
  position: [number, number, number];
  /** Rotation so the veranda (local +z) faces the lane. */
  rotationY: number;
  width: number;
  depth: number;
  wall: "mossy-plaster" | "yellow-plaster";
  tint: string;
  /** Painted lower band of the wall (common on Kerala and Konkan houses), or null. */
  band: string | null;
  door: string;
  roofPitch: number;
  veranda: number;
  windows: 2 | 3;
  /** Door open onto a warm-lit room. */
  doorOpen: boolean;
  /** Veranda bulb that actually lights its surroundings (a few houses, for performance). */
  lamp: boolean;
  /** A tulsi planter in the front yard. */
  tulsi: boolean;
  seed: number;
}

const PLINTH = 0.45;
const WALL_H = 2.75;
const WARM = new Color("#ffae5c");

type MaterialKey = "mossy-plaster" | "yellow-plaster" | "plinth" | "roof" | "wood" | "door" | "glow" | "metal" | "bulb";

let glowTexture: CanvasTexture | null = null;
/** Warm light from inside a room: brightest near the lamp, falling off towards the frame. */
function roomGlow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 44, 6, 64, 64, 92);
  g.addColorStop(0, "#ffe2a8");
  g.addColorStop(0.45, "#f3a24c");
  g.addColorStop(1, "#7a3d18");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  glowTexture = new CanvasTexture(c);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

const tmpColor = new Color();
/** Collects transformed, colour-tagged pieces of geometry per material. */
class PartList {
  parts = new Map<MaterialKey, BufferGeometry[]>();
  constructor(private readonly house: Matrix4) {}
  add(key: MaterialKey, geometry: BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], color = "#ffffff") {
    const g = geometry.clone();
    g.deleteAttribute("uv1"); // texture maps use the first UV set
    const local = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1));
    g.applyMatrix4(new Matrix4().multiplyMatrices(this.house, local));
    tmpColor.set(color).convertSRGBToLinear();
    const n = g.getAttribute("position").count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colours.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    g.setAttribute("color", new BufferAttribute(colours, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key)!.push(g);
  }
}

interface Eave {
  from: Vector3;
  to: Vector3;
  height: number;
}

/** Builds one house's parts (house-local geometry is generated at true texture scale). */
function buildHouse(spec: HouseSpec, tiles: Record<"wall" | "roof" | "wood" | "door", number>, out: PartList, eaves: Eave[], house: Matrix4) {
  const { width: w, depth: d, veranda: V } = spec;
  const wallTop = PLINTH + WALL_H;
  const ridge = wallTop + spec.roofPitch;
  const postTop = PLINTH + 2.35;
  const front = d / 2;
  const wallKey: MaterialKey = spec.wall;
  const r = seeded(spec.seed * 31 + 7);

  // Plinth and steps
  out.add("plinth", worldBox(w + 0.5, PLINTH, d + V + 0.3, tiles.wall), [0, PLINTH / 2, V / 2], undefined, "#8d8a82");
  for (let i = 0; i < 2; i++) out.add("plinth", worldBox(1.4, 0.15, 0.35, tiles.wall), [0, PLINTH - 0.15 * (i + 1) + 0.075, front + V + 0.32 + i * 0.32], undefined, "#7e7b74");

  // Walls (with an optional painted lower band) and gables
  if (spec.band) {
    out.add(wallKey, worldBox(w + 0.006, 1.0, d + 0.006, tiles.wall), [0, PLINTH + 0.5, 0], undefined, spec.band);
    out.add(wallKey, worldBox(w, WALL_H - 1.0, d, tiles.wall), [0, PLINTH + 1.0 + (WALL_H - 1.0) / 2, 0], undefined, spec.tint);
  } else {
    out.add(wallKey, worldBox(w, WALL_H, d, tiles.wall), [0, PLINTH + WALL_H / 2, 0], undefined, spec.tint);
  }
  const gable = new Shape();
  gable.moveTo(-d / 2, 0);
  gable.lineTo(0, ridge - wallTop);
  gable.lineTo(d / 2, 0);
  gable.closePath();
  const gableGeo = new ShapeGeometry(gable);
  const uv = gableGeo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tiles.wall, uv.getY(i) / tiles.wall);
  // One gable per side, facing outwards (shape's +z normal turned to ±x).
  out.add(wallKey, gableGeo, [w / 2, wallTop, 0], [0, Math.PI / 2, 0], spec.tint);
  out.add(wallKey, gableGeo, [-w / 2, wallTop, 0], [0, -Math.PI / 2, 0], spec.tint);

  // Roof: back slope, and a longer front slope sweeping down over the veranda; ridge tiles.
  const slope = (z1: number, y1: number, z2: number, y2: number) => {
    const length = Math.hypot(z2 - z1, y2 - y1);
    const angle = Math.atan2(y1 - y2, z2 - z1);
    out.add("roof", worldBox(w + 0.9, 0.07, length, tiles.roof), [0, (y1 + y2) / 2, (z1 + z2) / 2], [angle, 0, 0], "#b9907a");
  };
  slope(0.05, ridge + 0.05, -d / 2 - 0.65, wallTop - 0.35);
  slope(-0.05, ridge + 0.05, front + V + 0.45, postTop - 0.05);
  out.add("roof", worldBox(w + 1.0, 0.12, 0.26, tiles.roof), [0, ridge + 0.1, 0], undefined, "#a17460");
  eaves.push(eaveWorld(house, w + 0.9, front + V + 0.45, postTop - 0.07));
  eaves.push(eaveWorld(house, w + 0.9, -d / 2 - 0.65, wallTop - 0.37));

  // Veranda posts and beam
  const n = Math.max(3, Math.round(w / 2.2) + 1);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.1 + (i * (w - 0.2)) / (n - 1);
    out.add("wood", worldBox(0.16, postTop - PLINTH, 0.16, tiles.wood), [x, (PLINTH + postTop) / 2, front + V - 0.15], undefined, "#6b4a33");
  }
  out.add("wood", worldBox(w + 0.4, 0.14, 0.16, tiles.wood), [0, postTop, front + V - 0.15], undefined, "#5c3f2b");

  // Door: closed, or open onto a warm room
  if (spec.doorOpen) out.add("glow", new PlaneGeometry(1.0, 2.05), [0, PLINTH + 1.025, front + 0.014]);
  const hinge = new Matrix4().makeTranslation(-0.5, 0, 0).multiply(new Matrix4().makeRotationY(spec.doorOpen ? -1.15 : 0)).multiply(new Matrix4().makeTranslation(0.5, 0, 0));
  const doorGeo = worldPlane(1.0, 2.05, 2.0).applyMatrix4(hinge);
  out.add("door", doorGeo, [0, PLINTH + 1.025, front + 0.016], undefined, spec.door);
  out.add("wood", worldBox(1.16, 0.08, 0.08, tiles.wood), [0, PLINTH + 2.1, front + 0.03], undefined, "#4e3424");

  // Barred windows glowing with amber light, with open wooden shutters
  const xs = spec.windows === 3 ? [-w / 3, 0.9 + w / 9, w / 3 + 0.4] : [-w / 4 - 0.25, w / 4 + 0.25];
  for (const x of xs) {
    if (Math.abs(x) < 0.9) continue; // never over the door
    const y = PLINTH + 1.55;
    out.add("glow", new PlaneGeometry(0.95, 1.05), [x, y, front + 0.015]);
    for (const bx of [-0.3, -0.1, 0.1, 0.3]) out.add("metal", new BoxGeometry(0.016, 1.05, 0.016), [x + bx, y, front + 0.035]);
    for (const s of [-1, 1]) out.add("door", worldBox(0.47, 1.05, 0.04, tiles.door), [x + s * 0.72, y, front + 0.045], [0, s * (0.25 + r() * 0.3), 0], spec.door);
  }

  // Veranda bench and bulb
  out.add("wood", worldBox(1.6, 0.08, 0.42, tiles.wood), [w / 4 + 0.3, PLINTH + 0.44, front + 0.55], undefined, "#6b4a33");
  for (const x of [-0.7, 0.7]) out.add("wood", worldBox(0.08, 0.42, 0.36, tiles.wood), [w / 4 + 0.3 + x, PLINTH + 0.21, front + 0.55], undefined, "#5a3d29");
  out.add("bulb", new BoxGeometry(0.11, 0.11, 0.11), [-w / 4, postTop - 0.25, front + 0.6]);

  // Tulsi planter: a small plastered pedestal in the front yard
  if (spec.tulsi) {
    out.add("plinth", worldBox(0.6, 0.85, 0.6, tiles.wall), [w / 4, 0.425, front + V + 1.6], undefined, "#d9cdb2");
    out.add("plinth", worldBox(0.72, 0.08, 0.72, tiles.wall), [w / 4, 0.89, front + V + 1.6], undefined, "#b0573a");
  }
}

function eaveWorld(house: Matrix4, width: number, z: number, y: number): Eave {
  return {
    from: new Vector3(-width / 2, y, z).applyMatrix4(house),
    to: new Vector3(width / 2, y, z).applyMatrix4(house),
    height: y,
  };
}

/** The whole street of houses: a few merged draw calls, plus real lights on some verandas. */
export function Houses({ specs }: { specs: HouseSpec[] }) {
  const mossy = useTextureSet("mossy-plaster");
  const yellow = useTextureSet("yellow-plaster");
  const roof = useTextureSet("clay-roof-tiles");
  const wood = useTextureSet("wood-planks");
  const door = useTextureSet("pine-door");

  const merged = useMemo(() => {
    const all = new Map<MaterialKey, BufferGeometry[]>();
    const eaves: Eave[] = [];
    for (const spec of specs) {
      const house = new Matrix4().compose(new Vector3(...spec.position), new Quaternion().setFromEuler(new Euler(0, spec.rotationY, 0)), new Vector3(1, 1, 1));
      const list = new PartList(house);
      const wallTile = spec.wall === "mossy-plaster" ? mossy.tile : yellow.tile;
      buildHouse(spec, { wall: wallTile, roof: roof.tile, wood: wood.tile, door: door.tile }, list, eaves, house);
      for (const [k, geos] of list.parts) all.set(k, [...(all.get(k) ?? []), ...geos]);
    }
    const out = new Map<MaterialKey, BufferGeometry>();
    for (const [k, geos] of all) {
      const g = mergeGeometries(geos);
      if (!g) throw new Error(`Couldn't merge house parts for ${k}`);
      out.set(k, g);
      geos.forEach((x) => x.dispose());
    }
    return { geometries: out, eaves };
  }, [specs, mossy.tile, yellow.tile, roof.tile, wood.tile, door.tile]);

  const lamps = useMemo(
    () =>
      specs
        .filter((s) => s.lamp)
        .map((s) => {
          const m = new Matrix4().compose(new Vector3(...s.position), new Quaternion().setFromEuler(new Euler(0, s.rotationY, 0)), new Vector3(1, 1, 1));
          return { key: s.seed, at: new Vector3(-s.width / 4, PLINTH + 2.0, s.depth / 2 + 0.8).applyMatrix4(m) };
        }),
    [specs],
  );

  const g = merged.geometries;
  const glow = roomGlow();
  return (
    <group>
      {g.get("mossy-plaster") && (
        <mesh geometry={g.get("mossy-plaster")} castShadow receiveShadow>
          <meshStandardMaterial {...mossy.maps} vertexColors roughness={0.92} />
        </mesh>
      )}
      {g.get("yellow-plaster") && (
        <mesh geometry={g.get("yellow-plaster")} castShadow receiveShadow>
          <meshStandardMaterial {...yellow.maps} vertexColors roughness={0.92} />
        </mesh>
      )}
      {g.get("plinth") && (
        <mesh geometry={g.get("plinth")} receiveShadow>
          <meshStandardMaterial {...mossy.maps} vertexColors roughness={0.9} />
        </mesh>
      )}
      <mesh geometry={g.get("roof")} castShadow receiveShadow>
        <meshStandardMaterial {...roof.maps} vertexColors roughness={0.55} />
      </mesh>
      <mesh geometry={g.get("wood")} castShadow receiveShadow>
        <meshStandardMaterial {...wood.maps} vertexColors roughness={0.7} />
      </mesh>
      <mesh geometry={g.get("door")} castShadow>
        <meshStandardMaterial {...door.maps} vertexColors roughness={0.75} side={2} />
      </mesh>
      <mesh geometry={g.get("glow")}>
        <meshBasicMaterial map={glow} toneMapped={false} />
      </mesh>
      <mesh geometry={g.get("metal")}>
        <meshStandardMaterial color="#26221f" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh geometry={g.get("bulb")}>
        <meshBasicMaterial color={WARM} toneMapped={false} />
      </mesh>
      {lamps.map((l) => (
        <pointLight key={l.key} position={l.at} color={WARM} intensity={7} distance={11} decay={1.6} />
      ))}
      <RoofRunoff eaves={merged.eaves} />
    </group>
  );
}

/** Rainwater streaming off every eave in the street: one instanced draw call. */
function RoofRunoff({ eaves }: { eaves: Eave[] }) {
  const { geometry, material } = useMemo(() => {
    const quad = new PlaneGeometry(0.018, 1);
    quad.translate(0, -0.5, 0);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const rnd = seeded(913);
    const streams: number[] = [];
    for (const e of eaves) {
      const n = Math.round(e.from.distanceTo(e.to) / 0.35);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + (rnd() - 0.5) * 0.02;
        const p = e.from.clone().lerp(e.to, t);
        streams.push(p.x, p.y, p.z, rnd());
      }
    }
    g.setAttribute("aStream", new InstancedBufferAttribute(new Float32Array(streams), 4));
    g.instanceCount = streams.length / 4;
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: { uTime: atmosphere.uniforms.uTime, uFlash: atmosphere.uniforms.uFlash, ...fogUniforms() },
      vertexShader: /* glsl */ `
        attribute vec4 aStream;
        varying float vY;
        varying float vSeed;
        #include <fog_pars_vertex>
        void main() {
          // Each stream falls from its eave point to the ground, as a thin camera-facing strip.
          vec3 top = aStream.xyz;
          vec3 toCam = normalize(vec3(cameraPosition.x - top.x, 0.0, cameraPosition.z - top.z));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          vec3 world = top + side * position.x + vec3(0.0, position.y * top.y, 0.0);
          vY = -position.y;
          vSeed = aStream.w;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlash;
        varying float vY;
        varying float vSeed;
        #include <fog_pars_fragment>
        void main() {
          float phase = fract(vY * (6.0 + vSeed * 5.0) - uTime * (2.6 + vSeed * 1.4) + vSeed * 10.0);
          float drop = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.35, 0.6, phase));
          float a = drop * (0.12 + 0.12 * vSeed) * (1.0 - vY * 0.4);
          gl_FragColor = vec4(vec3(0.6, 0.68, 0.78) * (1.0 + uFlash * 2.0) * a, 1.0);
          #include <fog_fragment>
        }`,
    });
    return { geometry: g, material: m };
  }, [eaves]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
