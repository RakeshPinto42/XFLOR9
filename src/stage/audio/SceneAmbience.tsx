"use client";

import { useEffect, useState } from "react";
import { parseScene } from "@/engine/scene/format";
import { rainBed } from "@/engine/audio/synth";
import { getMixer, useSoundRunning } from "@/lib/sound/browser";
import { knownAssets } from "../assets";
import type { SceneEntry } from "../registry";

/** Rain amount 1 = the monsoon benchmark's downpour. */
const FULL_RAIN_DROPS = 9000;

/**
 * The scene's non-positional sound bed (rain), in every quality mode: Lite and Still keep the
 * sound even without the 3D view. Plays only while world sound is on and running.
 */
export function SceneAmbience({ scene }: { scene: SceneEntry }) {
  const running = useSoundRunning();
  const [rain, setRain] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    scene
      .document()
      .then((file) => {
        const doc = parseScene(file.default, knownAssets());
        const r = doc.environment.weather.rain;
        if (live) setRain(r ? Math.min(1, r.maxDrops / FULL_RAIN_DROPS) : null);
      })
      .catch((e: unknown) => console.warn(`[sound] no ambience for ${scene.id}: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, [scene]);

  useEffect(() => {
    const mixer = getMixer();
    const ctx = mixer.context as AudioContext | null;
    const bus = mixer.bus("ambience") as GainNode | null;
    if (!running || rain === null || !ctx || !bus) return;
    const voice = rainBed(ctx, bus, rain);
    return () => voice.stop();
  }, [running, rain]);

  return null;
}
