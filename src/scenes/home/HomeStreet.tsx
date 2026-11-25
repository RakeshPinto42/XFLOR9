"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, MathUtils, SRGBColorSpace, Vector3, type Group, type MeshStandardMaterial, type PerspectiveCamera } from "three";
import { streetView } from "@/features/home/streetState";
import type { ScreenRect } from "@/features/media/screenState";
import type { Vec3 } from "@/engine/scene/format";
import { MODULES, type ModuleId } from "@/lib/modules";
import type { SceneProps } from "@/stage/registry";
import MonsoonNeighbourhood from "@/scenes/monsoon/MonsoonNeighbourhood";

/**
 * The homepage: Monsoon Lane at dusk. The five modules are hand-painted signboards on posts along
 * the lane; pointing at one lights it, choosing one walks the camera up to it before the page
 * changes. The page lays real links over the signs (see features/home/streetState.ts); the canvas
 * never takes clicks.
 */

/** Board size in metres, and where each module stands (near to far, alternating sides). */
const BOARD = { width: 2.1, height: 1.0, raise: 2.35 };
interface Sign {
  id: ModuleId;
  at: [number, number];
  colour: string;
  ink: string;
  line: string;
  /** Board centre height (default BOARD.raise) and post spread (default: under the board). */
  raise?: number;
  spread?: number;
}
const SIGNS: Sign[] = [
  { id: "radio", at: [-3.5, 7], colour: "#e3a82b", ink: "#16204a", line: "LIVE STATIONS" },
  { id: "tv", at: [3.6, 2], colour: "#2d6bff", ink: "#f7f0df", line: "THE FAMILY SET" },
  { id: "music", at: [-3.6, -4], colour: "#f2601d", ink: "#f7f0df", line: "CASSETTE SHOP" },
  { id: "games", at: [3.7, -10], colour: "#6b3fd1", ink: "#f7f0df", line: "SAANP · MINES" },
  // Hung across the lane between two tall poles, so it isn't hidden behind the nearer signs.
  { id: "reading", at: [0, -19], colour: "#8fcfb4", ink: "#16204a", line: "READING ROOM · LIBRARY", raise: 4.3, spread: 2.9 },
];

/** Establishing shot down the lane; tall (phone) windows step back and widen to fit the signs. */
function shotFor(aspect: number): { position: Vec3; target: Vec3; fov: number } {
  return aspect < 0.9
    ? { position: [0, 4.2, 21], target: [0, 1.6, -10], fov: 66 }
    : { position: [0.2, 2.7, 15.5], target: [0, 1.6, -12], fov: 46 };
}

export default function HomeStreet(props: SceneProps) {
  const size = useThree((s) => s.size);
  const shot = shotFor(size.width / Math.max(1, size.height));
  // The monsoon scene file, holding this page's shot instead of its cinematic tour.
  const doc = useMemo(
    () => ({ ...props.document, camera: { ...props.document.camera, path: undefined, position: shot.position, target: shot.target, fov: shot.fov } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed only when the shot changes
    [props.document, shot.fov],
  );
  useEffect(() => () => streetView.reset(), []);
  return (
    <>
      <MonsoonNeighbourhood {...props} document={doc} />
      {SIGNS.map((s) => (
        <Signboard key={s.id} {...s} camera={shot.position} />
      ))}
      {!props.debug && <StreetCamera shot={shot} />}
    </>
  );
}

/**
 * Gentle hand-held sway, and a walk up to the chosen sign. It never leans towards a pointed-at
 * sign: that would slide the sign out from under the cursor.
 */
function StreetCamera({ shot }: { shot: { position: Vec3; target: Vec3; fov: number } }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const pos = useMemo(() => new Vector3(...shot.position), [shot]);
  const aim = useMemo(() => new Vector3(...shot.target), [shot]);
  const want = useMemo(() => ({ pos: new Vector3(), aim: new Vector3() }), []);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const { going } = streetView.get();
    const sign = SIGNS.find((s) => s.id === going);
    want.pos.set(...shot.position).add({ x: Math.sin(t * 0.13) * 0.12, y: Math.sin(t * 0.21) * 0.03, z: 0 });
    want.aim.set(...shot.target);
    if (sign) {
      // Stand in front of the board, a little towards the lane.
      const raise = sign.raise ?? BOARD.raise;
      want.pos.set(sign.at[0] * 0.35, raise - 0.2, sign.at[1] + 4.2);
      want.aim.set(sign.at[0], raise, sign.at[1]);
    }
    const k = 1 - Math.exp(-(going ? 2.6 : 1.4) * Math.min(delta, 0.1));
    pos.lerp(want.pos, k);
    aim.lerp(want.aim, k);
    camera.position.copy(pos);
    camera.lookAt(aim);
  });
  return null;
}

function Signboard({ id, at, colour, ink, line, raise = BOARD.raise, spread = BOARD.width / 2.4, camera }: Sign & { camera: Vec3 }) {
  const group = useRef<Group>(null);
  const board = useRef<MeshStandardMaterial>(null);
  const bulb = useRef<MeshStandardMaterial>(null);
  const name = MODULES.find((m) => m.id === id)!.name;
  const texture = usePaintedSign(name, line, colour, ink);
  // Face the establishing shot so every board reads from the lane.
  const rotY = Math.atan2(camera[0] - at[0], camera[2] - at[1]);
  useSignReporter(id, group, raise);

  useFrame((_, delta) => {
    const { hovered, going } = streetView.get();
    const lit = hovered === id || going === id;
    const k = 1 - Math.exp(-8 * Math.min(delta, 0.1));
    if (board.current) board.current.emissiveIntensity = MathUtils.lerp(board.current.emissiveIntensity, lit ? 0.95 : 0.32, k);
    if (bulb.current) bulb.current.emissiveIntensity = MathUtils.lerp(bulb.current.emissiveIntensity, lit ? 9 : 3.5, k);
  });

  // Posts reach the board's top edge (a crossbar carries a wide-set pair).
  const postHeight = raise + BOARD.height / 2;
  const crossbar = spread > BOARD.width / 2;
  return (
    <group ref={group} position={[at[0], 0, at[1]]} rotation={[0, rotY, 0]}>
      {/* Two wooden posts. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * spread, postHeight / 2, -0.04]} castShadow>
          <boxGeometry args={[0.09, postHeight + 0.1, 0.09]} />
          <meshStandardMaterial color="#3b2a1d" roughness={0.9} />
        </mesh>
      ))}
      {crossbar && (
        <mesh position={[0, raise + BOARD.height / 2 + 0.05, -0.04]}>
          <boxGeometry args={[spread * 2 + 0.1, 0.08, 0.08]} />
          <meshStandardMaterial color="#3b2a1d" roughness={0.9} />
        </mesh>
      )}
      {/* Frame, then the painted face. */}
      <mesh position={[0, raise, -0.05]} castShadow>
        <boxGeometry args={[BOARD.width + 0.12, BOARD.height + 0.12, 0.06]} />
        <meshStandardMaterial color="#2a1d14" roughness={0.85} />
      </mesh>
      <mesh position={[0, raise, -0.015]}>
        <planeGeometry args={[BOARD.width, BOARD.height]} />
        <meshStandardMaterial ref={board} map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.32} roughness={0.7} />
      </mesh>
      {/* A bare bulb on a bracket, warm against the rain. */}
      <mesh position={[0, raise + BOARD.height / 2 + 0.2, 0.12]}>
        <boxGeometry args={[0.03, 0.03, 0.3]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0, raise + BOARD.height / 2 + 0.14, 0.26]}>
        <sphereGeometry args={[0.06, 12, 8]} />
        <meshStandardMaterial ref={bulb} color="#ffd9a0" emissive="#ffb862" emissiveIntensity={3.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The sign's face, painted on a 2D canvas: weathered colour, a border, the name and one line. */
function usePaintedSign(name: string, line: string, colour: string, ink: string): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 305;
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => {
    let cancelled = false;
    const paint = () => {
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx || cancelled) return;
      const { width: w, height: h } = canvas;
      const css = getComputedStyle(document.documentElement);
      const display = css.getPropertyValue("--font-shrikhand").trim() || "serif";
      const pixel = css.getPropertyValue("--font-silkscreen").trim() || "monospace";
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, w, h);
      // Brush streaks and wear, from a fixed pattern so the board looks the same every visit.
      let seed = name.length * 977;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = rnd() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
        ctx.fillRect(0, rnd() * h, w, 1 + rnd() * 3);
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 8;
      ctx.strokeRect(18, 18, w - 36, h - 36);
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `112px ${display}`;
      ctx.fillText(name, w / 2, h * 0.44, w - 80);
      ctx.font = `30px ${pixel}`;
      ctx.fillText(line, w / 2, h * 0.78, w - 80);
      // Rain grime along the bottom edge.
      const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      texture.needsUpdate = true;
    };
    paint();
    // Repaint once the site's fonts are ready (the first paint may use fallbacks).
    document.fonts?.ready.then(paint).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [texture, name, line, colour, ink]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Reports where the board is in the window every frame (only changes are stored). */
function useSignReporter(id: ModuleId, group: React.RefObject<Group | null>, raise: number) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const local = useMemo(
    () =>
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => new Vector3((sx * (BOARD.width + 0.12)) / 2, raise + (sy * (BOARD.height + 0.12)) / 2, 0)),
      ),
    [raise],
  );
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let behind = false;
    for (const c of local) {
      p.copy(c).applyMatrix4(g.matrixWorld).project(camera);
      if (p.z > 1) behind = true;
      const x = ((p.x + 1) / 2) * size.width + size.left;
      const y = ((1 - p.y) / 2) * size.height + size.top;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const rect: ScreenRect | null = behind ? null : { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
    streetView.setSign(id, rect);
  });
}
