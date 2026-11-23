"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
} from "three";
import { atmosphere, seeded } from "./atmosphere";

/**
 * Continuous rain: thin streaks animated entirely on the GPU, in a box that follows the camera,
 * with a slight wind slant. `share` (0..1) comes from the adaptive quality level.
 */
export function Rain({ share, maxDrops }: { share: number; maxDrops: number }) {
  const MAX = maxDrops;
  const count = Math.min(MAX, Math.max(1200, Math.round(MAX * share)));
  const camera = useThree((s) => s.camera);

  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(0.008, 0.42);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const rnd = seeded(42);
    const seeds = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) {
      seeds[i * 4] = rnd();
      seeds[i * 4 + 1] = rnd();
      seeds[i * 4 + 2] = rnd();
      seeds[i * 4 + 3] = 0.75 + rnd() * 0.5; // speed variation
    }
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = MAX;
    return g;
  }, [MAX]);
  useEffect(() => {
    geometry.instanceCount = count;
  }, [geometry, count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: atmosphere.uniforms.uTime, uFlash: atmosphere.uniforms.uFlash, uCam: { value: [0, 0, 0] } },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime;
          uniform vec3 uCam;
          varying float vAlong;
          varying float vFade;
          const vec3 BOX = vec3(26.0, 16.0, 26.0);
          void main() {
            float speed = 9.5 * aSeed.w;
            float y = mod(aSeed.y * BOX.y - uTime * speed, BOX.y);
            // Wrap the drop's x/z around the camera so rain always surrounds the viewer.
            vec3 p = vec3(aSeed.x * BOX.x, y, aSeed.z * BOX.z);
            p.xz = mod(p.xz - uCam.xz + BOX.xz * 0.5, BOX.xz) + uCam.xz - BOX.xz * 0.5;
            p.y += uCam.y - 4.0;
            // Wind slant and billboard the thin quad towards the camera horizontally.
            vec3 toCam = normalize(vec3(cameraPosition.x - p.x, 0.0, cameraPosition.z - p.z));
            vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
            vec3 world = p + side * position.x + vec3(0.18, 1.0, 0.05) * position.y;
            vAlong = uv.y;
            float d = distance(world, cameraPosition);
            vFade = smoothstep(1.4, 4.0, d) * (1.0 - smoothstep(10.0, 13.0, d));
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uFlash;
          varying float vAlong;
          varying float vFade;
          void main() {
            float a = smoothstep(0.0, 0.4, vAlong) * (1.0 - smoothstep(0.7, 1.0, vAlong));
            vec3 col = vec3(0.62, 0.7, 0.8) * (0.17 + uFlash * 0.9);
            gl_FragColor = vec4(col * a * vFade, 1.0);
          }`,
      }),
    [],
  );

  useFrame(() => {
    material.uniforms.uCam.value = [camera.position.x, camera.position.y, camera.position.z];
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}

/** A soft, irregular mist puff (generated, original). */
function mistTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const rnd = seeded(7);
  for (let i = 0; i < 26; i++) {
    const x = size * (0.25 + rnd() * 0.5);
    const y = size * (0.35 + rnd() * 0.3);
    const r = size * (0.12 + rnd() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Drifting low mist: large soft banks along the lane, slowly moving with the wind, all in ONE
 * instanced draw call (camera-facing billboards positioned in the shader). Kept faint so nearby
 * houses and people stay visible: the mist adds depth, it doesn't hide the world.
 */
export function Mist({ banks, strength = 1 }: { banks: [number, number, number][]; strength?: number }) {
  const texture = useMemo(() => mistTexture(), []);
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const rnd = seeded(11);
    const data: number[] = [];
    for (const [x, y, z] of banks) {
      const h = 2.2 + rnd() * 2;
      // centre (x, y, z), width, height, drift speed, phase
      data.push(x, Math.max(y, h / 2 + 0.15), z, 9 + rnd() * 9, h, 0.15 + rnd() * 0.25, rnd() * 100, 0);
    }
    const arr = new Float32Array(data);
    g.setAttribute("aCentre", new InstancedBufferAttribute(arr.filter((_, i) => i % 8 < 4), 4));
    g.setAttribute("aMotion", new InstancedBufferAttribute(arr.filter((_, i) => i % 8 >= 4), 4));
    g.instanceCount = banks.length;
    return g;
  }, [banks]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: { uMap: { value: texture }, uStrength: { value: strength }, uTime: atmosphere.uniforms.uTime, uFlash: atmosphere.uniforms.uFlash, ...UniformsUtils.clone(UniformsLib.fog) },
        vertexShader: /* glsl */ `
          attribute vec4 aCentre;   // x, y, z, width
          attribute vec4 aMotion;   // height, speed, phase, -
          uniform float uTime;
          varying vec2 vUv;
          varying float vNear;
          #include <fog_pars_vertex>
          void main() {
            vUv = uv;
            vec3 centre = aCentre.xyz;
            centre.x += sin(uTime * 0.04 * aMotion.y + aMotion.z) * 6.0;
            float breathe = 1.0 + sin(uTime * 0.1 + aMotion.z) * 0.08;
            vec4 mvPosition = viewMatrix * vec4(centre, 1.0);
            // Banks close to the camera fade away: nearby houses and people stay clear,
            // distant banks give the depth.
            vNear = smoothstep(4.0, 14.0, -mvPosition.z);
            mvPosition.xy += position.xy * vec2(aCentre.w * breathe, aMotion.x);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uStrength;
          uniform float uFlash;
          varying vec2 vUv;
          varying float vNear;
          #include <fog_pars_fragment>
          void main() {
            vec4 t = texture2D(uMap, vUv);
            // #9aa7b4 in linear colour space (the renderer works in linear; sprites converted
            // this automatically, a raw shader must do it itself), at the original 0.55 opacity.
            gl_FragColor = vec4(vec3(0.323, 0.386, 0.456), t.a * (0.55 + uFlash * 0.3) * uStrength * vNear);
            #include <fog_fragment>
          }`,
      }),
    [texture, strength],
  );
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
}
