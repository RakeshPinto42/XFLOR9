"use client";

import { useFrame, type ThreeElements } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import { useModel } from "@/stage/assets";
import type { SceneProps } from "@/stage/registry";

/** A model from the asset manifest, placed like any other object. */
function Model({ id, ...props }: { id: string } & Omit<ThreeElements["primitive"], "object">) {
  const object = useModel(id);
  return <primitive object={object} {...props} />;
}

/**
 * F1 increment 1: blockout of the 1990s living room (room shell, warm and window light,
 * turning ceiling fan). Increment 3 replaces it with the full set, models and atmosphere.
 */
const W = 5.2; // room width (m)
const D = 4.6; // depth
const H = 3.0; // height

export default function LivingRoom({ level }: SceneProps) {
  return (
    <>
      {/* Background and fog must be direct children of the scene to attach to it. */}
      <color attach="background" args={["#1a1420"]} />
      <fog attach="fog" args={["#2a2030", 6, 14]} />

      {/* Light: a warm bulb, soft fill, and cool rainy light through the window. */}
      <hemisphereLight args={["#ffd9a8", "#3a2a24", 0.35]} />
      <pointLight position={[0.6, 2.6, 0.4]} intensity={9} distance={9} decay={2} color="#ffb86b" castShadow={level.shadows} shadow-mapSize={[1024, 1024]} />
      {/* Aims at the room centre (the light's default target is the origin). */}
      <spotLight position={[-W / 2 - 1.5, 2.4, -0.4]} angle={0.6} penumbra={0.8} intensity={12} distance={10} decay={2} color="#9fb6d8" />

      {/* Room shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#8a6f5a" roughness={0.55} />
      </mesh>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e9dcc4" roughness={0.95} />
      </mesh>
      <Wall position={[0, H / 2, -D / 2]} size={[W, H]} color="#d9c7a3" />
      <Wall position={[W / 2, H / 2, 0]} rotationY={-Math.PI / 2} size={[D, H]} color="#cdb994" />
      <WindowWall />

      {/* Window glow (rainy evening outside) */}
      <mesh position={[-W / 2 + 0.02, 1.6, -0.4]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.4, 1.3]} />
        <meshBasicMaterial color="#5f7898" />
      </mesh>

      <CeilingFan />

      {/* Models from the asset pipeline (increment 2). The cabinet is a stand-in until increment 3. */}
      <Suspense fallback={null}>
        <group position={[0, 0, -D / 2 + 0.45]}>
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.76, 0.55]} />
            <meshStandardMaterial color="#5a3a22" roughness={0.6} />
          </mesh>
          <Model id="television-01" position={[0, 0.76, 0]} />
          <Model id="brass-vase-03" position={[0.5, 0.76, 0.05]} />
        </group>
        <Model id="monobloc-chair-01" position={[1.45, 0, -0.2]} rotation={[0, -0.9, 0]} />
      </Suspense>
    </>
  );
}

function Wall({ position, size, color, rotationY = 0 }: { position: [number, number, number]; size: [number, number]; color: string; rotationY?: number }) {
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

/** Left wall with a window opening (four panels around the opening). */
function WindowWall() {
  const x = -W / 2;
  const [wx, wy, ww, wh] = [-0.4, 1.6, 1.4, 1.3]; // opening centre z, centre y, width, height
  const panels: [number, number, number, number][] = [
    // [centre z, centre y, width, height]
    [(-D / 2 + (wx - ww / 2)) / 2, H / 2, wx - ww / 2 + D / 2, H],
    [(D / 2 + (wx + ww / 2)) / 2, H / 2, D / 2 - (wx + ww / 2), H],
    [wx, (wy - wh / 2) / 2, ww, wy - wh / 2],
    [wx, (H + wy + wh / 2) / 2, ww, H - (wy + wh / 2)],
  ];
  return (
    <group>
      {panels.map(([z, y, w, h], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color="#cdb994" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function CeilingFan() {
  const blades = useRef<Group>(null);
  useFrame((_, delta) => {
    if (blades.current) blades.current.rotation.y += delta * 4.2;
  });
  return (
    <group position={[0, H, 0.2]}>
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
            {/* one blade, reaching out from the hub */}
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
