"use client";

import { useMemo } from "react";
import { PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useTextureSet, worldPlane } from "@/stage/textures";
import { atmosphere } from "./atmosphere";

/** Fresh copies of three's fog uniforms (three copies the scene fog into them each frame). */
export const fogUniforms = () => UniformsUtils.clone(UniformsLib.fog);

/** Size of the neighbourhood ground and the lane running through it (metres). */
export const GROUND = { width: 180, depth: 220, laneWidth: 4.6, laneStart: 30, laneEnd: -110 };

/** Laterite ground, the muddy lane and grassy verges, all textured at real-world scale. */
export function Ground() {
  const soil = useTextureSet("laterite-soil");
  const mud = useTextureSet("muddy-tracks");
  const grass = useTextureSet("leafy-grass");
  const laneLength = GROUND.laneStart - GROUND.laneEnd;
  const geo = useMemo(
    () => ({
      soil: worldPlane(GROUND.width, GROUND.depth, soil.tile),
      lane: worldPlane(GROUND.laneWidth, laneLength, mud.tile),
      verge: worldPlane(2.4, laneLength, grass.tile),
    }),
    [soil.tile, mud.tile, grass.tile, laneLength],
  );
  const laneZ = (GROUND.laneStart + GROUND.laneEnd) / 2;
  return (
    <group>
      <mesh geometry={geo.soil} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -40]} receiveShadow>
        <meshStandardMaterial {...soil.maps} color="#8f7f74" roughness={0.85} />
      </mesh>
      {/* The lane is slightly darker and wetter than the ground around it. */}
      <mesh geometry={geo.lane} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, laneZ]} receiveShadow>
        <meshStandardMaterial {...mud.maps} color="#6e625a" roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={geo.verge} rotation={[-Math.PI / 2, 0, 0]} position={[side * (GROUND.laneWidth / 2 + 1.3), 0.005, laneZ]} receiveShadow>
          <meshStandardMaterial {...grass.maps} color="#5f7552" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

const puddleShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vec4 mvPosition = viewMatrix * world;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uFlash;
    varying vec2 vUv;
    varying vec3 vWorld;
    #include <fog_pars_fragment>
    float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    // Rain ripples: in each small cell, a ring expands and fades at its own rhythm.
    float ripples(vec2 p) {
      float v = 0.0;
      for (int k = 0; k < 2; k++) {
        vec2 q = p * (k == 0 ? 3.0 : 4.7) + float(k) * 17.0;
        vec2 cell = floor(q);
        vec2 f = fract(q) - 0.5;
        float r = hash(cell);
        float t = fract(uTime * (0.7 + r * 0.6) + r * 7.0);
        vec2 c = (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5;
        float d = length(f - c);
        float ring = 1.0 - smoothstep(0.0, 0.018, abs(d - t * 0.45));
        v += ring * (1.0 - t) * smoothstep(0.45, 0.0, d);
      }
      return v;
    }
    void main() {
      // Soft, irregular outline.
      vec2 c = vUv - 0.5;
      float edge = length(c * vec2(1.0, 1.0 + 0.22 * sin(atan(c.y, c.x) * 3.0))) * 1.25;
      float alpha = smoothstep(0.5, 0.4, edge);
      float rip = ripples(vWorld.xz);
      // The water mirrors the grey sky; ripples break the reflection into glints.
      // Dark, glossy water: the grey sky reflected faintly; ripple rings catch a little light.
      vec3 viewDir = normalize(cameraPosition - vWorld);
      float fresnel = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
      vec3 sky = vec3(0.22, 0.25, 0.29) + vec3(0.5, 0.55, 0.7) * uFlash;
      vec3 deep = vec3(0.03, 0.03, 0.03);
      vec3 col = mix(deep, sky, 0.08 + fresnel * 0.32) + vec3(0.32, 0.35, 0.4) * rip * 0.35;
      gl_FragColor = vec4(col, alpha * 0.95);
      #include <fog_fragment>
    }`,
};

/** Rain puddles on the lane, with continuous ripples. */
export function Puddles({ spots }: { spots: [number, number, number, number, number][] }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: {
          uTime: atmosphere.uniforms.uTime,
          uFlash: atmosphere.uniforms.uFlash,
          ...fogUniforms(),
        },
        ...puddleShader,
      }),
    [],
  );
  // All puddles in one geometry (each keeps its own 0..1 UVs for its outline): one draw call.
  const geometry = useMemo(() => {
    const parts = spots.map(([x, z, w, d, rot]) =>
      new PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(rot).translate(x, 0.012, z),
    );
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged!;
  }, [spots]);
  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}

/** Rainwater flowing along a shallow channel at the edge of the lane. */
export function Channel({ x, from, to }: { x: number; from: number; to: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: {
          uTime: atmosphere.uniforms.uTime,
          uFlash: atmosphere.uniforms.uFlash,
          ...fogUniforms(),
        },
        vertexShader: puddleShader.vertexShader,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uFlash;
          varying vec2 vUv;
          varying vec3 vWorld;
          #include <fog_pars_fragment>
          float hash(float n) { return fract(sin(n) * 43758.5453); }
          void main() {
            // Streaks flowing down the channel (towards -z), uneven across its width.
            float flow = vWorld.z * 1.6 + uTime * 1.8;
            float lane = floor(vUv.x * 6.0);
            float f = fract(flow * (0.8 + hash(lane) * 0.6) + hash(lane + 3.0));
            float s = smoothstep(0.55, 0.85, f) * (1.0 - smoothstep(0.85, 1.0, f));
            float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
            vec3 col = mix(vec3(0.03, 0.03, 0.03), vec3(0.2, 0.22, 0.25), 0.15 + s * 0.3) + vec3(0.4, 0.45, 0.55) * uFlash;
            gl_FragColor = vec4(col, edge * 0.28);
            #include <fog_fragment>
          }`,
      }),
    [],
  );
  return (
    <mesh material={material} position={[x, 0.015, (from + to) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[0.45, from - to]} />
    </mesh>
  );
}
