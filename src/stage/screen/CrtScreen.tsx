"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { MeshBasicMaterial, Vector3, type Mesh, type PerspectiveCamera, type PointLight } from "three";
import { dampVec3, framingDistance } from "@/engine/camera/rig";
import type { Vec3 } from "@/engine/scene/format";
import { sameRect, screenView, type ScreenRect } from "@/features/media/screenState";
import { SceneCamera } from "@/stage/camera/SceneCamera";
import type { SceneCamera as SceneCameraSpec } from "@/engine/scene/format";

/**
 * Shared 3D pieces for rooms whose CRT shows a provider's official player (TV, Music): the glass
 * that switches on, the report of where the glass is in the window (the page places the real
 * player on it, see screenState.ts) and the camera that glides to the screen while watching.
 */

export interface Glass {
  centre: Vec3;
  width: number;
  height: number;
}

/**
 * The CRT glass on the television-01 model, relative to the model's origin (metres). Measured
 * from a straight-on render (M3): the screen is the left part of the set, knobs on the right.
 */
const TELEVISION_01_GLASS = { centre: [-0.052, 0.256, 0.2] as Vec3, width: 0.375, height: 0.31 };

/** The glass of a television-01 placed at `at` (no rotation). */
export function television01Glass(at: Vec3): Glass {
  const c = TELEVISION_01_GLASS.centre;
  return { centre: [at[0] + c[0], at[1] + c[1], at[2] + c[2]], width: TELEVISION_01_GLASS.width, height: TELEVISION_01_GLASS.height };
}

/** Marks a 3D room as running while mounted (the page then uses the glass instead of a frame). */
export function useScreenRoom() {
  useEffect(() => {
    screenView.set({ room3d: true });
    return () => screenView.set({ room3d: false, screen: null, settled: false });
  }, []);
}

const useScreenView = () => useSyncExternalStore(screenView.subscribe, screenView.get, screenView.server);

/**
 * The glass: dark when off; switching on opens a bright horizontal line into a cool glowing
 * screen (as a CRT warms up), and its light falls on the room. Once the camera arrives the
 * player covers the glass and the glow behind it fades; the light on the room stays.
 */
export function CrtGlass({ centre, width, height, lightDistance = 4.5 }: Glass & { lightDistance?: number }) {
  const { on, settled } = useScreenView();
  const mesh = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const material = useMemo(() => new MeshBasicMaterial({ color: "#0b0d0e", toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const warm = useRef(0); // 0 = off … 1 = fully warmed up
  const covered = useRef(0); // 0..1: how far the player covers the glass
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    warm.current = on ? Math.min(1, warm.current + dt / 0.6) : Math.max(0, warm.current - dt / 0.25);
    covered.current = settled ? Math.min(1, covered.current + dt / 0.5) : Math.max(0, covered.current - dt / 0.2);
    const w = warm.current;
    // First a thin bright line; then it opens to the full screen and settles to a glow.
    const open = Math.min(1, Math.max(0.02, (w - 0.15) / 0.5));
    if (mesh.current) mesh.current.scale.set(1, w > 0 ? open : 1, 1);
    const flash = w > 0 && w < 0.6 ? 1.6 : 1;
    const glow = w * flash * (1 - 0.92 * covered.current);
    material.color.setRGB(0.04 + 0.5 * glow, 0.05 + 0.58 * glow, 0.055 + 0.7 * glow);
    if (light.current) light.current.intensity = 1.8 * w;
  });
  return (
    <group position={centre}>
      <mesh ref={mesh} material={material}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <pointLight ref={light} position={[0, 0, 0.35]} color="#bcd4ff" intensity={0} distance={lightDistance} decay={2} />
    </group>
  );
}

/**
 * Reports where the glass is in the window each frame (only when it moves by half a pixel).
 * In developer mode the free camera never "arrives", so the player simply follows the glass.
 */
export function ScreenReporter({ centre, width, height, debug }: Glass & { debug: boolean }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const corners = useMemo(
    () => [-1, 1].flatMap((sx) => [-1, 1].map((sy) => new Vector3(centre[0] + (sx * width) / 2, centre[1] + (sy * height) / 2, centre[2]))),
    [centre, width, height],
  );
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let behind = false;
    for (const c of corners) {
      p.copy(c).project(camera);
      if (p.z > 1) behind = true;
      const x = ((p.x + 1) / 2) * size.width + size.left;
      const y = ((1 - p.y) / 2) * size.height + size.top;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const rect: ScreenRect | null = behind ? null : { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
    if (!sameRect(rect, screenView.get().screen)) screenView.set({ screen: rect });
    if (debug) screenView.set({ settled: screenView.get().watching });
  });
  return null;
}

/** A camera position and aim. */
export interface Shot {
  position: Vec3;
  target: Vec3;
}

/** How quickly the camera glides (higher = faster) and when it counts as arrived (metres). */
const GLIDE_RATE = 2.2;
const SETTLED_WITHIN = 0.01;

/**
 * Visitors' camera: the room shot; while watching, straight in front of the glass at the
 * distance that fits it (wide or tall window: `fill` = largest share of the window's height and
 * width), a little below centre so controls fit underneath. Frame-rate-independent glide both ways.
 * Developer mode gets the free camera instead.
 */
export function GlideCamera({ room, glass, fill, debug, camera: spec }: { room: Shot; glass: Glass; fill: { height: number; width: number }; debug: boolean; camera: SceneCameraSpec }) {
  if (debug) return <SceneCamera camera={spec} debug />;
  return <Glide room={room} glass={glass} fill={fill} />;
}

function Glide({ room, glass, fill }: { room: Shot; glass: Glass; fill: { height: number; width: number } }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const { watching } = useScreenView();
  const pos = useRef<Vec3 | null>(null);
  const aim = useRef<Vec3 | null>(null);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    let toPos = room.position;
    let toAim = room.target;
    if (watching) {
      const d = framingDistance(glass.width, glass.height, (camera.fov * Math.PI) / 180, camera.aspect, fill.height, fill.width);
      const visibleH = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
      const lift = visibleH * 0.08; // screen sits above centre: room for the controls below
      toPos = [glass.centre[0], glass.centre[1] - lift, glass.centre[2] + d];
      toAim = [glass.centre[0], glass.centre[1] - lift, glass.centre[2]];
    }
    pos.current = pos.current ? dampVec3(pos.current, toPos, GLIDE_RATE, dt) : toPos;
    aim.current = aim.current ? dampVec3(aim.current, toAim, GLIDE_RATE * 1.3, dt) : toAim;
    camera.position.set(...pos.current);
    camera.lookAt(...aim.current);
    const off = Math.hypot(pos.current[0] - toPos[0], pos.current[1] - toPos[1], pos.current[2] - toPos[2]);
    screenView.set({ settled: watching && off < SETTLED_WITHIN });
  });
  return null;
}
