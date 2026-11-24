"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { dampVec3, fly, FREE_SPEED, lookFrom, loopPhase, pathAim, turn, wheelSpeed, type Look } from "@/engine/camera/rig";
import type { CameraMode, SceneCamera as SceneCameraSpec, Vec3 } from "@/engine/scene/format";

/**
 * F3 — runs the scene's camera mode on the shared canvas camera. Developer mode (?stage-debug)
 * always gets the free fly camera; visitors get the scene's start mode. The scene's settings hook
 * (useSceneSettings) has already placed the camera at the file's start position and aim.
 *
 * `clock` lets a scene drive the cinematic path from its own clock (the monsoon's ?t= and pause);
 * without one, the canvas clock is used.
 */
export function SceneCamera({ camera, debug, clock }: { camera: SceneCameraSpec; debug: boolean; clock?: () => number }) {
  const mode: CameraMode = debug ? "free" : camera.startMode;
  switch (mode) {
    case "free":
      return <FreeCamera />;
    case "cinematic":
      // Without a path, the cinematic view holds the file's start shot.
      return camera.path ? <CinematicPath path={camera.path} clock={clock} /> : null;
    default:
      // Further modes arrive in later F3 steps; until then the start shot is held.
      return null;
  }
}

/** A slow loop along the file's path, aiming ahead (see pathAim). */
function CinematicPath({ path, clock }: { path: NonNullable<SceneCameraSpec["path"]>; clock?: () => number }) {
  const camera = useThree((s) => s.camera);
  const curve = useMemo(() => new CatmullRomCurve3(path.points.map((p) => new Vector3(...p)), path.closed, "centripetal"), [path]);
  const aim = useRef<Vec3 | null>(null);
  useFrame((state, delta) => {
    const t = loopPhase(clock ? clock() : state.clock.elapsedTime, path.loopSeconds);
    camera.position.copy(curve.getPointAt(t));
    const target = pathAim(camera.position.toArray(), path.lookAhead);
    aim.current = aim.current ? dampVec3(aim.current, target, 1.5, delta) : target;
    camera.lookAt(...aim.current);
  });
  return null;
}

/** Radians the view turns per pixel of drag (a shared setting in a later F3 step). */
const LOOK_SENSITIVITY = 0.003;

/** Movement keys by physical position (works on any keyboard layout). */
const KEYS = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyE", "PageUp"],
  down: ["KeyQ", "PageDown"],
  fast: ["ShiftLeft", "ShiftRight"],
} as const;
const MOVE_KEYS = new Set<string>(Object.values(KEYS).flat());

/**
 * Developer fly camera: drag to look, W/A/S/D or arrows to move, E/Q up and down, Shift for
 * speed, mouse wheel to change speed. Passes through everything (it's for inspecting scenes).
 */
function FreeCamera() {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const held = useHeldKeys();
  const look = useRef<Look | null>(null);
  const speed = useRef<number>(FREE_SPEED.initial);
  const dir = useMemo(() => new Vector3(), []);

  useEffect(() => {
    let dragging: number | null = null;
    let last = [0, 0];
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || dragging !== null) return;
      dragging = e.pointerId;
      last = [e.clientX, e.clientY];
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== dragging || !look.current) return;
      look.current = turn(look.current, e.clientX - last[0], e.clientY - last[1], LOOK_SENSITIVITY);
      last = [e.clientX, e.clientY];
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === dragging) dragging = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      speed.current = wheelSpeed(speed.current, e.deltaY);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [canvas]);

  useFrame((_, delta) => {
    // Start from wherever the camera is on the first frame (the scene's start shot), so
    // entering developer mode never jumps.
    if (!look.current) {
      camera.getWorldDirection(dir);
      const p = camera.position.toArray();
      look.current = lookFrom(p, [p[0] + dir.x, p[1] + dir.y, p[2] + dir.z]);
    }
    const k = held.current;
    const axis = (plus: readonly string[], minus: readonly string[]) => (plus.some((c) => k.has(c)) ? 1 : 0) - (minus.some((c) => k.has(c)) ? 1 : 0);
    const input = { forward: axis(KEYS.forward, KEYS.back), right: axis(KEYS.right, KEYS.left), up: axis(KEYS.up, KEYS.down) };
    const s = speed.current * (KEYS.fast.some((c) => k.has(c)) ? FREE_SPEED.fastFactor : 1);
    camera.position.fromArray(fly(camera.position.toArray(), look.current, input, Math.min(delta, 0.1), s));
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
  });
  return null;
}

/**
 * Movement keys currently held. Ignored while typing in a field or with Ctrl/Alt/⌘ (browser
 * shortcuts); everything is released when the window loses focus, so keys never stick.
 */
function useHeldKeys() {
  const held = useRef(new Set<string>());
  useEffect(() => {
    const keys = held.current;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (!MOVE_KEYS.has(e.code) || e.ctrlKey || e.altKey || e.metaKey || typing(e.target)) return;
      keys.add(e.code);
      if (e.code.startsWith("Arrow") || e.code.startsWith("Page")) e.preventDefault(); // don't scroll the page
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const clear = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      keys.clear();
    };
  }, []);
  return held;
}
