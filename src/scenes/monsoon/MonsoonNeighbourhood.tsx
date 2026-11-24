"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import type { HouseObject, PuddleObject, TreeObject } from "@/engine/scene/format";
import { SceneCamera } from "@/stage/camera/SceneCamera";
import { StageEffects } from "@/stage/effects";
import type { SceneProps } from "@/stage/registry";
import { ActivityMarkers, SceneLights, SceneObjects, useSceneSettings, type ObjectKit } from "@/stage/scene-view";
import { atmosphere, seeded, tickAtmosphere } from "./atmosphere";
import { Channel, Ground, Puddles } from "./ground";
import { Houses, type HouseSpec } from "./house";
import { MonsoonSky } from "./sky";
import { Vegetation, type Tree } from "./vegetation";
import { Mist, Rain } from "./weather";
import { MonsoonThunder } from "./sound";
import { SpatialSound } from "@/stage/audio/SpatialSound";

/**
 * U1 benchmark: a dark, misty Indian monsoon neighbourhood at dusk, drawn from its scene file
 * (content/scenes/monsoon-neighbourhood.json). Cool blue-grey daylight, warm amber house lights,
 * continuous rain, drifting mist, distant lightning and a slow cinematic camera.
 */

/** The monsoon object kits: each draws every object of its type at once (few draw calls). */
const KITS: Partial<Record<string, ObjectKit>> = {
  "lane-ground": (objects) =>
    objects.map((o) =>
      o.type === "lane-ground" ? (
        <Suspense key={o.id} fallback={null}>
          <Ground size={o.size} lane={o.lane} />
        </Suspense>
      ) : null,
    ),
  "water-channel": (objects) => objects.map((o) => (o.type === "water-channel" ? <Channel key={o.id} x={o.x} from={o.from} to={o.to} /> : null)),
  house: (objects) => (
    <Suspense fallback={null}>
      <Houses specs={toHouses(objects as HouseObject[])} />
    </Suspense>
  ),
  tree: (objects) => <Vegetation trees={toTrees(objects as TreeObject[])} />,
  puddle: (objects) => <Puddles spots={toPuddles(objects as PuddleObject[])} />,
};

// Kit inputs are memoised per object list (the document never changes while shown).
const memo = <A extends object, R>(fn: (a: A) => R) => {
  const cache = new WeakMap<A, R>();
  return (a: A) => {
    if (!cache.has(a)) cache.set(a, fn(a));
    return cache.get(a)!;
  };
};
const toHouses = memo((list: HouseObject[]): HouseSpec[] =>
  list.map((h) => ({
    position: h.position,
    rotationY: h.rotation?.[1] ?? 0,
    width: h.width,
    depth: h.depth,
    wall: h.wall,
    tint: h.tint,
    band: h.band,
    door: h.door,
    roofPitch: h.roofPitch,
    veranda: h.veranda,
    windows: h.windows,
    doorOpen: h.doorOpen,
    lamp: h.lamp,
    tulsi: h.tulsi,
    seed: h.seed,
  })),
);
const toTrees = memo((list: TreeObject[]): Tree[] => list.map((t) => ({ kind: t.kind, x: t.position[0], z: t.position[2], scale: t.scale ?? 1, seed: t.seed })));
const toPuddles = memo((list: PuddleObject[]): [number, number, number, number, number][] =>
  list.map((p) => [p.position[0], p.position[2], p.size[0], p.size[1], p.rotation?.[1] ?? 0]),
);

const flash = () => atmosphere.uniforms.uFlash.value;
/** The scene clock (honours ?t= and ?stage-pause): the camera path follows the weather. */
const clock = () => atmosphere.uniforms.uTime.value;

export default function MonsoonNeighbourhood({ level, debug, document: doc }: SceneProps) {
  useSceneSettings(doc);
  const { weather } = doc.environment;
  const fx = doc.environment.effects;
  // ?mist=<0..1> overrides the file's mist strength (a tuning aid for art direction).
  const mistStrength = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const v = Number(q.get("mist"));
    return q.has("mist") && Number.isFinite(v) && v >= 0 && v <= 1 ? v : (weather.mist?.strength ?? 0);
  }, [weather.mist]);
  const random = useMemo(() => seeded(77), []);
  useEffect(() => {
    if (weather.lightning) atmosphere.nextStrike = weather.lightning.firstSeconds;
  }, [weather.lightning]);
  // ?t=<seconds> starts the clock (camera path, weather) at a given moment: reproducible views.
  useEffect(() => {
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (Number.isFinite(t) && t > 0) atmosphere.uniforms.uTime.value = t;
  }, []);
  // ?stage-pause freezes the clock (with ?t=, a reproducible frame for comparisons and posters).
  const paused = useMemo(() => new URLSearchParams(window.location.search).has("stage-pause"), []);
  useFrame((_, delta) => tickAtmosphere(paused ? 0 : Math.min(delta, 0.1), random, weather.lightning));

  return (
    <>
      {doc.environment.sky === "monsoon-clouds" && <MonsoonSky />}
      <SceneLights lights={doc.lights} shadows={level.shadows} flash={flash} />
      <SceneCamera camera={doc.camera} debug={debug} clock={clock} />
      <SceneObjects objects={doc.objects} kits={KITS} />
      {weather.mist && <Mist banks={weather.mist.banks} strength={mistStrength} />}
      {weather.rain && <Rain share={level.particles} maxDrops={weather.rain.maxDrops} />}
      {debug && <ActivityMarkers spots={doc.activities} />}
      <SpatialSound anchors={doc.audio} />
      {weather.lightning && <MonsoonThunder />}
      {fx && <StageEffects enabled={level.effects} bloom={fx.bloom} bloomThreshold={fx.bloomThreshold} vignette={fx.vignette} grain={fx.grain} />}
    </>
  );
}
