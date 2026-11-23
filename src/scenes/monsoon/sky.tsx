"use client";

import { useMemo } from "react";
import { BackSide, ShaderMaterial } from "three";
import { atmosphere } from "./atmosphere";

/**
 * Overcast monsoon sky: charcoal-grey with slowly drifting, layered cloud masses; never a sun.
 * Lightning brightens the clouds near the horizon in the strike's direction.
 */
export function MonsoonSky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: atmosphere.uniforms.uTime,
          uFlash: atmosphere.uniforms.uFlash,
          uBearing: atmosphere.uniforms.uBearing,
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uFlash;
          uniform float uBearing;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
            return v;
          }
          void main() {
            float h = clamp(vDir.y, -0.1, 1.0);
            // Charcoal zenith to a slightly lighter, bluish-grey horizon haze.
            vec3 zenith = vec3(0.105, 0.118, 0.135);
            vec3 horizon = vec3(0.30, 0.335, 0.37);
            vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
            // Cloud masses: domain-warped fbm projected onto the dome, drifting with the wind.
            vec2 uv = vDir.xz / max(0.12, vDir.y + 0.18) * 0.9;
            vec2 drift = vec2(uTime * 0.012, uTime * 0.004);
            float c = fbm(uv + drift + fbm(uv * 0.6 - drift) * 0.8);
            col *= mix(0.72, 1.18, smoothstep(0.35, 0.75, c));
            // Lightning: soft glow inside the clouds near the horizon, towards the strike.
            float az = atan(vDir.x, -vDir.z) / 3.14159;
            float toward = exp(-pow((az - uBearing * 0.6) * 3.0, 2.0)) * smoothstep(0.45, 0.0, h);
            col += vec3(0.55, 0.6, 0.72) * uFlash * (0.25 + toward * 1.6) * (0.6 + c);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[220, 48, 24]} />
    </mesh>
  );
}
