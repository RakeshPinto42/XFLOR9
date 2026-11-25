/**
 * F3 — shared camera logic for every scene (and later the Studio): plain TypeScript, no three.js,
 * so it can be unit-tested. The stage (src/stage/camera/) feeds it input and applies the result.
 *
 * Conventions: metres, radians, seconds; y is up. A look direction is yaw + pitch: yaw 0 looks
 * along -z, positive yaw turns left; pitch is up/down, kept short of straight up or down.
 */
import type { Vec3 } from "../scene/format";

export interface Look {
  yaw: number;
  pitch: number;
}

/** Just short of straight up/down (~86°): past it, the view would flip over. */
export const PITCH_LIMIT = 1.5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Moves `current` towards `target`, the same amount per second at any frame rate (30, 60 or
 * 144 fps all end up in the same place). `rate` is how quickly: higher = snappier.
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

export function dampVec3(current: Vec3, target: Vec3, rate: number, dt: number): Vec3 {
  return [damp(current[0], target[0], rate, dt), damp(current[1], target[1], rate, dt), damp(current[2], target[2], rate, dt)];
}

// ---------- cinematic ------------------------------------------------------------------------

/** How far round a looping path the camera is (0..1) at this time. */
export function loopPhase(seconds: number, loopSeconds: number): number {
  const t = (seconds / loopSeconds) % 1;
  return t < 0 ? t + 1 : t;
}

/**
 * Where the cinematic camera aims from `position` (the scene format's `lookAhead`): further along
 * -z, pulled towards the centre line, never below 1 m. On the monsoon lane, the return leg of the
 * loop becomes a slow pull-back instead of a turn towards the edge of the world.
 */
export function pathAim(position: Vec3, lookAhead: number): Vec3 {
  return [position[0] * 0.35, Math.max(1, position[1] * 0.45), position[2] - lookAhead];
}

// ---------- looking around -------------------------------------------------------------------

/** The look direction from one point towards another. */
export function lookFrom(from: Vec3, to: Vec3): Look {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(dy, Math.hypot(dx, dz)), -PITCH_LIMIT, PITCH_LIMIT) };
}

/** Unit vector the look points along. */
export function forward({ yaw, pitch }: Look): Vec3 {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/** Turns the look by a pointer movement (pixels); dragging right turns right, up looks up. */
export function turn(look: Look, dx: number, dy: number, radiansPerPixel: number): Look {
  return { yaw: look.yaw - dx * radiansPerPixel, pitch: clamp(look.pitch - dy * radiansPerPixel, -PITCH_LIMIT, PITCH_LIMIT) };
}

// ---------- free (developer) camera ----------------------------------------------------------

/** Held movement keys, each -1, 0 or 1. */
export interface MoveInput {
  forward: number;
  right: number;
  up: number;
}

export const FREE_SPEED = { initial: 6, min: 0.5, max: 60, fastFactor: 4 } as const;

/**
 * One step of the developer fly camera: forward/back along the look (so looking down and
 * pressing W dives), strafe sideways level with the ground, up/down straight up. Diagonals are
 * no faster than straight lines.
 */
export function fly(position: Vec3, look: Look, input: MoveInput, dt: number, speed: number): Vec3 {
  const len = Math.hypot(input.forward, input.right, input.up);
  if (len === 0) return position;
  const step = (speed * dt) / len;
  const f = forward(look);
  const rx = Math.cos(look.yaw);
  const rz = -Math.sin(look.yaw);
  return [
    position[0] + (f[0] * input.forward + rx * input.right) * step,
    position[1] + (f[1] * input.forward + input.up) * step,
    position[2] + (f[2] * input.forward + rz * input.right) * step,
  ];
}

/** Mouse wheel changes the fly speed in steps of 20%, within limits. */
export function wheelSpeed(speed: number, wheelDeltaY: number): number {
  const factor = wheelDeltaY < 0 ? 1.2 : wheelDeltaY > 0 ? 1 / 1.2 : 1;
  return clamp(speed * factor, FREE_SPEED.min, FREE_SPEED.max);
}

// ---------- framing ----------------------------------------------------------------------------

/**
 * How far in front of a flat rectangle (a TV screen) the camera must stand, looking straight at
 * it, so it fills at most `heightShare` of the view's height and `widthShare` of its width.
 * Works for wide desktop and tall phone windows alike (`aspect` = width / height).
 */
export function framingDistance(width: number, height: number, fovY: number, aspect: number, heightShare: number, widthShare: number): number {
  const visibleHeight = Math.max(height / heightShare, width / (widthShare * aspect));
  return visibleHeight / (2 * Math.tan(fovY / 2));
}
