"use client";

import { useEffect } from "react";
import { suddenGain, thunderDelay } from "@/engine/audio/mixer";
import { rng, thunder } from "@/engine/audio/synth";
import { getMixer, soundPrefs } from "@/lib/sound/browser";
import { atmosphere } from "./atmosphere";

/** Distant strikes: 0.7–2 km away, so thunder follows the flash by about 2–6 seconds. */
const NEAR = 700;
const FAR = 2000;
/** Longest a roll lasts after its delay (for the voice limit). */
const ROLL_SECONDS = 10;

/**
 * Thunder for each lightning strike, in sync with the flash: delayed by distance (sound travels
 * 343 m/s), quieter and duller when farther, panned towards the strike. "Reduce sudden sounds"
 * removes the crack and softens the roll.
 */
export function MonsoonThunder() {
  useEffect(() => {
    const random = rng(1977);
    let seed = 1;
    const onStrike = (bearing: number) => {
      const mixer = getMixer();
      const ctx = mixer.context as AudioContext | null;
      const bus = mixer.bus("ambience") as GainNode | null;
      if (!ctx || !bus || !mixer.acquireVoice()) return;
      const prefs = soundPrefs.get();
      const distance = NEAR + random() * (FAR - NEAR);
      const delay = thunderDelay(distance);
      let strength = 1 - ((distance - NEAR) / (FAR - NEAR)) * 0.6;
      if (prefs.reduceSudden) strength = Math.min(strength, 0.5);
      const gain = ctx.createGain();
      gain.gain.value = suddenGain(prefs) * 0.9;
      gain.connect(bus);
      thunder(ctx, gain, { delay, strength, pan: bearing * 0.8, seed: seed++ });
      setTimeout(
        () => {
          gain.disconnect();
          mixer.releaseVoice();
        },
        (delay + ROLL_SECONDS) * 1000,
      );
    };
    atmosphere.onStrike.add(onStrike);
    return () => {
      atmosphere.onStrike.delete(onStrike);
    };
  }, []);
  return null;
}
