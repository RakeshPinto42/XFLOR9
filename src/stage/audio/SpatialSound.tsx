"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import type { AudioAnchor } from "@/engine/scene/format";
import { rng, surfaceLoop } from "@/engine/audio/synth";
import { getMixer, useSoundRunning } from "@/lib/sound/browser";

/** Anchor kinds with a generated sound today; the others (radio, birds, children) come later. */
const BUILT: Partial<Record<AudioAnchor["kind"], "tiles" | "drips">> = {
  "rain-on-tiles": "tiles",
  "eave-drips": "drips",
};

/**
 * Positioned sound from the scene file's audio anchors, heard from the camera (Full mode only).
 * Uses the cheap "equal power" panner: direction and distance, without per-ear filtering.
 */
export function SpatialSound({ anchors }: { anchors: AudioAnchor[] }) {
  const running = useSoundRunning();
  const camera = useThree((s) => s.camera);
  const scratch = useMemo(() => ({ forward: new Vector3(), up: new Vector3() }), []);

  useEffect(() => {
    const mixer = getMixer();
    const ctx = mixer.context as AudioContext | null;
    const bus = mixer.bus("ambience") as GainNode | null;
    if (!running || !ctx || !bus) return;
    const random = rng(21);
    const voices = anchors.flatMap((a) => {
      const kind = BUILT[a.kind];
      if (!kind) return [];
      const panner = ctx.createPanner();
      panner.panningModel = "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = 2.5;
      panner.rolloffFactor = 1.2;
      setPosition(panner, a.position);
      panner.connect(bus);
      const voice = surfaceLoop(ctx, panner, kind, random);
      return [{ voice, panner }];
    });
    return () => {
      for (const { voice, panner } of voices) {
        voice.stop();
        setTimeout(() => panner.disconnect(), 800);
      }
    };
  }, [running, anchors]);

  // The listener is the camera: position, facing and up direction, every frame.
  useFrame(() => {
    const ctx = getMixer().context as AudioContext | null;
    if (!ctx) return;
    const l = ctx.listener;
    const p = camera.position;
    camera.getWorldDirection(scratch.forward);
    scratch.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const { forward: f, up: u } = scratch;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t);
      l.forwardY.setValueAtTime(f.y, t);
      l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t);
      l.upY.setValueAtTime(u.y, t);
      l.upZ.setValueAtTime(u.z, t);
    } else {
      // Older browsers only have the deprecated setters.
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  });
  return null;
}

function setPosition(panner: PannerNode, [x, y, z]: [number, number, number]) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else panner.setPosition(x, y, z);
}
