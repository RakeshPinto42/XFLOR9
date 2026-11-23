"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Fragment, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Color, Fog, FogExp2, Object3D, type Group, type Light, type PerspectiveCamera } from "three";
import type { ActivitySpot, Material, SceneDocument, SceneLight, SceneObject } from "@/engine/scene/format";
import { useModel } from "./assets";

/**
 * Shared pieces that draw a scene document (F2): environment and camera settings, lights, and the
 * object types every scene can use. Scene-specific object types (houses, trees…) are drawn by
 * "kits" the scene passes in, so a scene's bundle only carries the code it needs.
 */

/** Applies the document's background, fog, exposure and camera; restores them when the scene leaves. */
export function useSceneSettings(doc: SceneDocument) {
  // Read through get(): changing the renderer, scene and camera is this hook's whole job.
  const get = useThree((s) => s.get);
  const { environment: env, camera: cam } = doc;
  useEffect(() => {
    const { scene, gl } = get();
    const before = { background: scene.background, fog: scene.fog, exposure: gl.toneMappingExposure };
    scene.background = env.background ? new Color(env.background) : null;
    const f = env.fog;
    scene.fog = !f ? null : f.type === "exp2" ? new FogExp2(f.color, f.density) : new Fog(f.color, f.near, f.far);
    gl.toneMappingExposure = env.exposure;
    return () => {
      scene.background = before.background;
      scene.fog = before.fog;
      gl.toneMappingExposure = before.exposure;
    };
  }, [get, env]);
  useEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    const before = { near: camera.near, far: camera.far, fov: camera.fov, position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    camera.near = cam.near;
    camera.far = cam.far;
    camera.fov = cam.fov;
    camera.position.set(...cam.position);
    camera.lookAt(...cam.target);
    camera.updateProjectionMatrix();
    return () => {
      camera.near = before.near;
      camera.far = before.far;
      camera.fov = before.fov;
      camera.position.copy(before.position);
      camera.quaternion.copy(before.quaternion);
      camera.updateProjectionMatrix();
    };
  }, [get, cam]);
}

/** The document's lights. `flash` (0..1) brightens lights that have a `flashBoost` (lightning). */
export function SceneLights({ lights, shadows, flash }: { lights: SceneLight[]; shadows: boolean; flash?: () => number }) {
  const refs = useRef(new Map<string, Light>());
  useFrame(() => {
    if (!flash) return;
    const f = flash();
    for (const l of lights) {
      if (!("flashBoost" in l) || l.flashBoost === undefined) continue;
      const light = refs.current.get(l.id);
      if (light) light.intensity = l.intensity + f * l.flashBoost;
    }
  });
  const keep = (id: string) => (light: Light | null) => {
    if (light) refs.current.set(id, light);
    else refs.current.delete(id);
  };
  return (
    <>
      {lights.map((l) => {
        switch (l.type) {
          case "hemisphere":
            return <hemisphereLight key={l.id} ref={keep(l.id)} args={[l.sky, l.ground, l.intensity]} />;
          case "directional": {
            const s = l.shadow;
            return (
              <directionalLight
                key={l.id}
                ref={keep(l.id)}
                position={l.position}
                color={l.color}
                intensity={l.intensity}
                castShadow={shadows && !!s}
                shadow-mapSize={s ? [s.mapSize, s.mapSize] : undefined}
                shadow-camera-left={s ? -s.extent : undefined}
                shadow-camera-right={s?.extent}
                shadow-camera-top={s?.extent}
                shadow-camera-bottom={s ? -s.extent : undefined}
                shadow-camera-far={s?.far}
                shadow-bias={s?.bias}
              />
            );
          }
          case "point":
            return (
              <pointLight
                key={l.id}
                ref={keep(l.id)}
                position={l.position}
                color={l.color}
                intensity={l.intensity}
                distance={l.distance}
                decay={l.decay}
                castShadow={shadows && !!l.shadow}
                shadow-mapSize={l.shadow ? [l.shadow.mapSize, l.shadow.mapSize] : undefined}
              />
            );
          case "spot":
            return <SpotWithTarget key={l.id} light={l} />;
        }
      })}
    </>
  );
}

function SpotWithTarget({ light: l }: { light: Extract<SceneLight, { type: "spot" }> }) {
  // The target must be in the scene graph so its world position is kept up to date.
  const target = useMemo(() => new Object3D(), []);
  useEffect(() => {
    target.position.set(...l.target);
    target.updateMatrixWorld();
  }, [target, l.target]);
  return (
    <>
      <primitive object={target} />
      <spotLight position={l.position} target={target} color={l.color} intensity={l.intensity} distance={l.distance} decay={l.decay} angle={l.angle} penumbra={l.penumbra} />
    </>
  );
}

/** Draws all objects of the given types at once (e.g. every house merged into a few draw calls). */
export type ObjectKit = (objects: SceneObject[]) => ReactNode;

const BUILT_IN = new Set(["model", "box", "plane", "ceiling-fan"]);

/**
 * The document's objects: built-in types here, the rest through the scene's kits. An object type
 * with no renderer is reported in the console (never silently dropped).
 */
export function SceneObjects({ objects, kits = {} }: { objects: SceneObject[]; kits?: Partial<Record<SceneObject["type"], ObjectKit>> }) {
  const groups = useMemo(() => {
    const byType = new Map<SceneObject["type"], SceneObject[]>();
    for (const o of objects) byType.set(o.type, [...(byType.get(o.type) ?? []), o]);
    return byType;
  }, [objects]);
  const missing = [...groups.keys()].filter((t) => !BUILT_IN.has(t) && !kits[t]);
  useEffect(() => {
    if (missing.length) console.warn(`[stage] this scene cannot draw object types: ${missing.join(", ")}`);
  }, [missing.join()]); // eslint-disable-line react-hooks/exhaustive-deps -- compare by value
  return (
    <>
      {objects.map((o) => {
        switch (o.type) {
          case "box":
            return (
              <mesh key={o.id} position={o.position} rotation={o.rotation} scale={o.scale} castShadow={o.castShadow} receiveShadow={o.receiveShadow}>
                <boxGeometry args={o.size} />
                <SceneMaterial m={o.material} />
              </mesh>
            );
          case "plane":
            return (
              <mesh key={o.id} position={o.position} rotation={o.rotation} scale={o.scale} castShadow={o.castShadow} receiveShadow={o.receiveShadow}>
                <planeGeometry args={o.size} />
                <SceneMaterial m={o.material} />
              </mesh>
            );
          case "model":
            return (
              <Suspense key={o.id} fallback={null}>
                <Model asset={o.asset} position={o.position} rotation={o.rotation} scale={o.scale} />
              </Suspense>
            );
          case "ceiling-fan":
            return <CeilingFan key={o.id} position={o.position} rotation={o.rotation} scale={o.scale} speed={o.speed} />;
          default:
            return null;
        }
      })}
      {[...groups].map(([type, list]) => {
        const kit = kits[type];
        return kit ? <Fragment key={type}>{kit(list)}</Fragment> : null;
      })}
    </>
  );
}

function SceneMaterial({ m }: { m: Material }) {
  return m.unlit ? <meshBasicMaterial color={m.color} /> : <meshStandardMaterial color={m.color} roughness={m.roughness ?? 1} metalness={m.metalness ?? 0} />;
}

type Placement = { position: [number, number, number]; rotation?: [number, number, number]; scale?: number };

/** A model from the asset manifest. */
function Model({ asset, ...placement }: { asset: string } & Placement) {
  const object = useModel(asset);
  return <primitive object={object} {...placement} />;
}

/** A three-blade ceiling fan (hub hanging 0.4 m below its mounting point). */
function CeilingFan({ speed, ...placement }: { speed: number } & Placement) {
  const blades = useRef<Group>(null);
  useFrame((_, delta) => {
    if (blades.current) blades.current.rotation.y += delta * speed;
  });
  return (
    <group {...placement}>
      <mesh position={[0, -0.18, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.36, 12]} />
        <meshStandardMaterial color="#d8d2c4" metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={blades} position={[0, -0.4, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.12, 24]} />
          <meshStandardMaterial color="#efe9dc" metalness={0.3} roughness={0.4} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <mesh position={[0.62, -0.02, 0]} rotation={[0.08, 0, 0]} castShadow>
              <boxGeometry args={[1.05, 0.008, 0.13]} />
              <meshStandardMaterial color="#e6dfcf" roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
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

/** Developer view only: where F4's characters will play, read and talk (never shown to visitors). */
export function ActivityMarkers({ spots }: { spots: ActivitySpot[] }) {
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
