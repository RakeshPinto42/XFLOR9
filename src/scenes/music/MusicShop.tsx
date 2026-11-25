"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Color, MeshStandardMaterial, Object3D, type Group, type InstancedMesh, type Mesh } from "three";
import type { Vec3 } from "@/engine/scene/format";
import { shopState } from "@/features/music/shopState";
import type { SceneProps } from "@/stage/registry";
import { SceneLights, SceneObjects, useSceneSettings } from "@/stage/scene-view";
import { CrtGlass, GlideCamera, ScreenReporter, television01Glass, useScreenRoom, type Shot } from "@/stage/screen/CrtScreen";

/**
 * The Music module's room (M4): a small cassette shop on the monsoon street at dusk, drawn from
 * content/scenes/cassette-shop.json, with shelves of tapes, the shop's tape deck and the
 * catalogue's tapes on the counter. A public-domain tape goes into the deck and its reels turn
 * while it plays; a video tape plays on the shop's little TV (YouTube's player must be visible),
 * and the camera glides to it as on the TV page.
 *
 * The racks, deck and counter tapes are drawn here (not yet scene-file object types; see
 * known-issues MU-3). Tapes are original designs: plain shells and blank coloured labels.
 */

/** A compact cassette: 10 × 6.4 cm face, 1.2 cm thick. */
const TAPE = { w: 0.1, h: 0.064, d: 0.012 };
const FILL = { height: 0.5, width: 0.9 };
const DECK_AT: Vec3 = [0.2, 1.04, -0.45];

export default function MusicShop({ level, debug, document: doc }: SceneProps) {
  useSceneSettings(doc);
  useScreenRoom();
  const tv = doc.objects.find((o) => o.id === "shop-tv");
  const tvAt: Vec3 = tv && "position" in tv ? tv.position : [1.45, 1.04, -0.5];
  const key = tvAt.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed only when the TV moves (key)
  const glass = useMemo(() => television01Glass(tvAt), [key]);
  const room: Shot = useMemo(() => ({ position: doc.camera.position, target: doc.camera.target }), [doc.camera]);
  return (
    <>
      <SceneLights lights={doc.lights} shadows={level.shadows} />
      <SceneObjects objects={doc.objects} />
      <CassetteRacks />
      <TapeDeck at={DECK_AT} />
      <CounterTapes />
      <CrtGlass {...glass} lightDistance={3} />
      <ScreenReporter {...glass} debug={debug} />
      <GlideCamera room={room} glass={glass} fill={FILL} debug={debug} camera={doc.camera} />
    </>
  );
}

const useShop = () => useSyncExternalStore(shopState.subscribe, shopState.get, shopState.server);

// ---------- shelves of tapes (two instanced meshes: shells and labels) -------------------------

const SHELL_COLOURS = ["#1d1d22", "#2b2b30", "#e6e0d2", "#7a1f2b", "#1f3f7a", "#3a2a1a", "#c8c2b0", "#2f5d50"];
const LABEL_COLOURS = ["#e3a82b", "#f2d16b", "#e6e0d2", "#f2601d", "#8fcfb4", "#c8b48a", "#d96a8a", "#9fb6d8"];
const SHELF_TOPS = [0.9, 1.35, 1.8, 2.25].map((y) => y + 0.015);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function CassetteRacks() {
  const shells = useRef<InstancedMesh>(null);
  const labels = useRef<InstancedMesh>(null);
  const layout = useMemo(() => {
    const rnd = seeded(1990);
    const items: { x: number; y: number; z: number; tilt: number; shell: string; label: string }[] = [];
    for (const top of SHELF_TOPS) {
      let x = -2.45;
      while (x < 2.45 - TAPE.w) {
        // Face-out, leaning back against the wall a little; the odd gap where a tape was sold.
        if (rnd() > 0.06) items.push({ x: x + TAPE.w / 2, y: top + TAPE.h / 2, z: -2.42, tilt: -0.12 - rnd() * 0.05, shell: SHELL_COLOURS[Math.floor(rnd() * SHELL_COLOURS.length)], label: LABEL_COLOURS[Math.floor(rnd() * LABEL_COLOURS.length)] });
        x += TAPE.w + 0.01 + rnd() * 0.006;
      }
    }
    return items;
  }, []);
  useLayoutEffect(() => {
    const o = new Object3D();
    const c = new Color();
    layout.forEach((t, i) => {
      o.position.set(t.x, t.y, t.z);
      o.rotation.set(t.tilt, 0, 0);
      o.updateMatrix();
      shells.current?.setMatrixAt(i, o.matrix);
      shells.current?.setColorAt(i, c.set(t.shell));
      o.translateZ(TAPE.d / 2 + 0.0005);
      o.updateMatrix();
      labels.current?.setMatrixAt(i, o.matrix);
      labels.current?.setColorAt(i, c.set(t.label));
    });
    for (const m of [shells.current, labels.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [layout]);
  return (
    <>
      <instancedMesh ref={shells} args={[undefined, undefined, layout.length]} castShadow receiveShadow>
        <boxGeometry args={[TAPE.w, TAPE.h, TAPE.d]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={labels} args={[undefined, undefined, layout.length]}>
        <planeGeometry args={[TAPE.w * 0.86, TAPE.h * 0.42]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </>
  );
}

// ---------- the tape deck ---------------------------------------------------------------------

/**
 * A portable two-speaker tape deck. Its window shows the tape inside (the tape's own colours);
 * the reels turn and the power light glows only while music is actually playing.
 */
function TapeDeck({ at }: { at: Vec3 }) {
  const { inDeck, playing, tapes } = useShop();
  const tape = tapes.find((t) => t.id === inDeck) ?? null;
  const reels = useRef<(Mesh | null)[]>([]);
  const led = useMemo(() => new MeshStandardMaterial({ color: "#401010", emissive: "#ff3020", emissiveIntensity: 0 }), []);
  const shell = useMemo(() => new MeshStandardMaterial({ roughness: 0.45 }), []);
  const label = useMemo(() => new MeshStandardMaterial({ roughness: 0.8 }), []);
  useEffect(() => () => [led, shell, label].forEach((m) => m.dispose()), [led, shell, label]);
  useEffect(() => {
    if (tape) {
      shell.color.set(tape.shell);
      label.color.set(tape.label);
    }
  }, [tape, shell, label]);
  useFrame((_, delta) => {
    led.emissiveIntensity = playing ? 2.2 : 0;
    if (!playing) return;
    for (const r of reels.current) if (r) r.rotation.z -= Math.min(delta, 0.1) * 4.5;
  });
  const W = 0.56, H = 0.26, D = 0.14;
  const front = D / 2 + 0.001;
  return (
    <group position={[at[0], at[1] + H / 2, at[2]]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.55} metalness={0.15} />
      </mesh>
      {/* Speakers, with a lighter ring around each cone. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.18, -0.01, front]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.004, 32]} />
            <meshStandardMaterial color="#9a9aa2" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.003]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.004, 32]} />
            <meshStandardMaterial color="#141416" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* The cassette window and the tape behind it. */}
      <group position={[0, 0.01, front]}>
        <mesh>
          <planeGeometry args={[0.15, 0.1]} />
          <meshStandardMaterial color="#0c0c0e" roughness={0.2} metalness={0.3} />
        </mesh>
        {tape && (
          <group position={[0, 0, 0.002]}>
            <mesh material={shell}>
              <boxGeometry args={[TAPE.w * 1.1, TAPE.h * 1.1, 0.002]} />
            </mesh>
            <mesh material={label} position={[0, TAPE.h * 0.2, 0.0015]}>
              <planeGeometry args={[TAPE.w, TAPE.h * 0.38]} />
            </mesh>
            {[-1, 1].map((side, i) => (
              <mesh
                key={side}
                ref={(m) => {
                  reels.current[i] = m;
                }}
                position={[side * 0.026, -0.008, 0.002]}
              >
                <circleGeometry args={[0.011, 6]} />
                <meshStandardMaterial color="#f2f0ea" roughness={0.5} />
              </mesh>
            ))}
          </group>
        )}
      </group>
      {/* Keys along the top, the handle and the power light. */}
      {[-0.06, -0.03, 0, 0.03, 0.06].map((x) => (
        <mesh key={x} position={[x, H / 2 + 0.006, D / 2 - 0.025]}>
          <boxGeometry args={[0.022, 0.012, 0.03]} />
          <meshStandardMaterial color="#b8b8c0" roughness={0.35} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, H / 2 + 0.045, -0.02]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.16, 0.009, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#1c1c20" roughness={0.6} />
      </mesh>
      <mesh position={[0.1, 0.085, front]} material={led}>
        <sphereGeometry args={[0.006, 12, 8]} />
      </mesh>
    </group>
  );
}

// ---------- the catalogue's tapes on the counter ----------------------------------------------

/** The shop's tapes stand on the counter; the one in the deck leaves its place. */
function CounterTapes() {
  const { tapes, inDeck } = useShop();
  const group = useRef<Group>(null);
  return (
    <group ref={group} position={[0.62, 1.04, -0.22]}>
      {tapes.map((t, i) => (
        <group key={t.id} position={[i * (TAPE.w + 0.02), TAPE.h / 2 + 0.002, 0]} rotation={[-0.25, -0.15, 0]} visible={t.id !== inDeck}>
          <mesh castShadow>
            <boxGeometry args={[TAPE.w, TAPE.h, TAPE.d]} />
            <meshStandardMaterial color={t.shell} roughness={0.45} />
          </mesh>
          <mesh position={[0, TAPE.h * 0.15, TAPE.d / 2 + 0.0005]}>
            <planeGeometry args={[TAPE.w * 0.86, TAPE.h * 0.42]} />
            <meshStandardMaterial color={t.label} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
