"use client";

import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

/**
 * Shared cinematic finishing for Full mode: glow around bright lights (bloom), a soft vignette and
 * light film grain. Scenes choose the strength; adaptive quality turns it off at lower levels.
 */
export function StageEffects({
  enabled,
  bloom = 0.9,
  bloomThreshold = 0.62,
  vignette = 0.55,
  grain = 0.06,
}: {
  enabled: boolean;
  bloom?: number;
  bloomThreshold?: number;
  vignette?: number;
  grain?: number;
}) {
  if (!enabled) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={bloom} luminanceThreshold={bloomThreshold} luminanceSmoothing={0.25} mipmapBlur />
      <Vignette offset={0.32} darkness={vignette} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={grain} />
    </EffectComposer>
  );
}
