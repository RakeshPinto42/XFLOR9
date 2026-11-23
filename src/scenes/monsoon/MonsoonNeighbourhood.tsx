"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { CatmullRomCurve3, Color, FogExp2, Vector3, type DirectionalLight, type HemisphereLight } from "three";
import { StageEffects } from "@/stage/effects";
import type { SceneProps } from "@/stage/registry";
import { activitySpots, audioAnchors, type ActivitySpot } from "./activities";
import { atmosphere, seeded, tickAtmosphere } from "./atmosphere";
import { Channel, GROUND, Ground, Puddles } from "./ground";
import { Houses, type HouseSpec } from "./house";
import { MonsoonSky } from "./sky";
import { Vegetation, type Tree } from "./vegetation";
import { Mist, Rain } from "./weather";

/**
 * U1 benchmark (F1 increment 3): a dark, misty Indian monsoon neighbourhood at dusk.
 * Cool blue-grey daylight under an overcast sky, warm amber house lights, continuous rain,
 * drifting mist, distant lightning and a slow cinematic camera.
 */

const FOG = new Color("#5b6670");

function useLayout() {
  return useMemo(() => {
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
          // Lower walls painted in the colours typical of village houses (or left plain).
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
    // Dense canopy trees behind the houses on both sides: the dark-green wall of the village.
    for (let z = 14; z > -105; z -= 7 + rnd() * 4) {
      for (const side of [-1, 1]) {
        trees.push({ kind: "canopy", x: side * (17 + rnd() * 7), z: z + rnd() * 3, scale: 0.9 + rnd() * 0.5, seed: ts++ });
        if (rnd() < 0.6) trees.push({ kind: "palm", x: side * (21 + rnd() * 9), z: z - 3, scale: 1 + rnd() * 0.3, seed: ts++ });
      }
    }
    // Trees closing the near end (behind the camera's start) so no edge of the world shows.
    for (let x = -26; x <= 26; x += 5 + rnd() * 3) trees.push({ kind: "canopy", x, z: 24 + rnd() * 8, scale: 1.1 + rnd() * 0.4, seed: ts++ });
    for (let x = -18; x <= 18; x += 7) trees.push({ kind: "palm", x: x + rnd() * 3, z: 19 + rnd() * 3, scale: 1, seed: ts++ });
    // Trees closing the far end of the lane, so fog reveals layered depth.
    for (let x = -22; x <= 22; x += 6 + rnd() * 3) trees.push({ kind: "canopy", x, z: -82 - rnd() * 12, scale: 1.1 + rnd() * 0.5, seed: ts++ });
    // Bushes along the verges.
    for (let z = 10; z > -70; z -= 3 + rnd() * 4) {
      const side = rnd() < 0.5 ? -1 : 1;
      trees.push({ kind: "bush", x: side * (3.4 + rnd() * 1.4), z, scale: 0.7 + rnd() * 0.6, seed: ts++ });
    }

    const puddles: [number, number, number, number, number][] = [];
    for (let z = 10; z > -75; z -= 4 + rnd() * 6) puddles.push([(rnd() - 0.5) * 3, z, 1.2 + rnd() * 2.2, 0.8 + rnd() * 1.4, rnd() * 3]);

    const mist: [number, number, number][] = [];
    for (let z = 12; z > -95; z -= 6 + rnd() * 5) mist.push([(rnd() - 0.5) * 18, 0.9 + rnd() * 2.2, z]);
    for (let z = -20; z > -95; z -= 12) mist.push([(rnd() - 0.5) * 30, 5 + rnd() * 4, z]); // higher banks among the trees

    return { houses, trees, puddles, mist, activities: activitySpots(houses), audio: audioAnchors(houses) };
  }, []);
}

/** The camera's slow loop: down the lane at child height, up over the roofs, and back. */
const PATH = new CatmullRomCurve3(
  [
    new Vector3(0.9, 1.55, 13),
    new Vector3(-0.6, 1.5, 2),
    new Vector3(0.7, 1.65, -10),
    new Vector3(1.4, 2.4, -22),
    new Vector3(-0.5, 5.2, -31),
    new Vector3(-3.6, 4.4, -20),
    new Vector3(-2.4, 2.4, -6),
    new Vector3(-0.4, 1.7, 7),
  ],
  true,
  "centripetal",
);
const LOOP_SECONDS = 95;

function CameraPath() {
  const camera = useThree((s) => s.camera);
  const look = useRef(new Vector3());
  const ahead = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const t = (atmosphere.uniforms.uTime.value / LOOP_SECONDS) % 1;
    camera.position.copy(PATH.getPointAt(t));
    // Always look into the village: down the lane, a little ahead of the camera, drawn towards
    // the lane's centre. The return leg becomes a slow pull-back rather than a turn to the edge.
    const p = camera.position;
    ahead.set(p.x * 0.35, Math.max(1.0, p.y * 0.45), p.z - 15);
    look.current.lerp(ahead, Math.min(1, delta * 1.5));
    camera.lookAt(look.current);
  });
  return null;
}

function Lights({ shadows }: { shadows: boolean }) {
  const hemi = useRef<HemisphereLight>(null);
  const key = useRef<DirectionalLight>(null);
  useFrame(() => {
    const flash = atmosphere.uniforms.uFlash.value;
    if (hemi.current) hemi.current.intensity = 1.25 + flash * 2.4;
    if (key.current) key.current.intensity = 0.75 + flash * 3.2;
  });
  return (
    <>
      {/* Cool, sunless overcast light from the whole sky. */}
      <hemisphereLight ref={hemi} args={["#8a9aa9", "#3a3a2e", 1.25]} />
      <directionalLight
        ref={key}
        position={[-18, 30, 10]}
        color="#9fb2c4"
        intensity={0.75}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
      />
    </>
  );
}

export default function MonsoonNeighbourhood({ level, debug }: SceneProps) {
  const layout = useLayout();
  // ?mist=<0..1> scales the mist banks (a tuning aid for art direction; default 0.75).
  const mistStrength = useMemo(() => {
    const v = Number(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("mist"));
    return Number.isFinite(v) && v >= 0 && v <= 1 && new URLSearchParams(window.location.search).has("mist") ? v : 0.75;
  }, []);
  const scene = useThree((s) => s.scene);
  const random = useMemo(() => seeded(77), []);
  // An outdoor view distance (the sky dome sits at 220 m) and exposure; restored on exit.
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    const before = gl.toneMappingExposure;
    gl.toneMappingExposure = 1.35;
    return () => {
      gl.toneMappingExposure = before;
    };
  }, [gl]);
  useEffect(() => {
    const cam = camera as import("three").PerspectiveCamera;
    const before = { near: cam.near, far: cam.far, fov: cam.fov };
    cam.near = 0.1;
    cam.far = 400;
    cam.fov = 42;
    cam.updateProjectionMatrix();
    return () => {
      Object.assign(cam, before);
      cam.updateProjectionMatrix();
    };
  }, [camera]);
  // Fog belongs to this scene only: removed again when the visitor leaves.
  useEffect(() => {
    scene.fog = new FogExp2(FOG, 0.026);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  // ?t=<seconds> starts the clock (camera path, weather) at a given moment: reproducible views.
  useEffect(() => {
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (Number.isFinite(t) && t > 0) atmosphere.uniforms.uTime.value = t;
  }, []);
  useFrame((_, delta) => tickAtmosphere(Math.min(delta, 0.1), random));

  return (
    <>
      <MonsoonSky />
      <Lights shadows={level.shadows} />
      {!debug && <CameraPath />}
      <Suspense fallback={null}>
        <Ground />
        <Channel x={-GROUND.laneWidth / 2 - 0.1} from={GROUND.laneStart} to={-80} />
        <Houses specs={layout.houses} />
      </Suspense>
      <Puddles spots={layout.puddles} />
      <Vegetation trees={layout.trees} />
      <Mist banks={layout.mist} strength={mistStrength} />
      <Rain share={level.particles} />
      {debug && <ActivityMarkers spots={layout.activities} />}
      <StageEffects enabled={level.effects} bloom={1.05} bloomThreshold={0.6} vignette={0.5} grain={0.05} />
    </>
  );
}

const MARKER_COLOURS: Record<ActivitySpot["kind"], string> = {
  cricket: "#e8c547",
  football: "#5fb3e8",
  marbles: "#c77de8",
  reading: "#7de8a1",
  cycling: "#e87d5f",
  chatting: "#e8e8e8",
};

/** Developer view only: where F4's children will play, read and talk (never shown to visitors). */
function ActivityMarkers({ spots }: { spots: ActivitySpot[] }) {
  return (
    <group>
      {spots.map((s) => (
        <group key={s.id}>
          <mesh position={[s.position[0], s.position[1] + 0.03, s.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[s.radius * 0.92, s.radius, 40]} />
            <meshBasicMaterial color={MARKER_COLOURS[s.kind]} transparent opacity={0.55} depthWrite={false} />
          </mesh>
          {s.route?.slice(1).map((p, i) => (
            <mesh key={i} position={[p[0], 0.05, p[2]]}>
              <sphereGeometry args={[0.18, 8, 6]} />
              <meshBasicMaterial color={MARKER_COLOURS[s.kind]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
