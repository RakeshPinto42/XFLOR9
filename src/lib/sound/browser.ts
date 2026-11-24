"use client";

import { useSyncExternalStore } from "react";
import { AudioMixer, DEFAULT_SOUND_PREFS, parseSoundPrefs, type SoundPrefs } from "@/engine/audio/mixer";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";

/**
 * Browser wiring for the shared audio engine: remembered sound settings, one mixer per tab
 * (module singleton, so it survives page navigation), unlock on the visitor's first gesture,
 * and fade-out while the tab is hidden.
 */

export const soundPrefs = createLocalStore<SoundPrefs>(STORAGE_KEYS.soundPrefs, DEFAULT_SOUND_PREFS, parseSoundPrefs);

export function useSoundPrefs(): SoundPrefs {
  return useLocalStore(soundPrefs);
}

let mixer: AudioMixer | null = null;

/** Web Audio, including older Safari's prefixed version; null where it doesn't exist. */
function createContext(): AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: "playback" });
  } catch {
    return null;
  }
}

export function getMixer(): AudioMixer {
  if (mixer) return mixer;
  const m = new AudioMixer(createContext);
  mixer = m;
  m.setPrefs(soundPrefs.get());
  soundPrefs.subscribe(() => m.setPrefs(soundPrefs.get()));
  // Browsers only start audio from a gesture; any click or key press counts.
  const unlock = () => m.unlock();
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => m.setHidden(document.visibilityState === "hidden"));
  return m;
}

/** The radio tells the mixer when it plays, so ambience can dip under it. */
export function setRadioPlaying(playing: boolean) {
  getMixer().setRadioPlaying(playing);
}

const subscribeMixer = (l: () => void) => getMixer().subscribe(l);
const isRunning = () => getMixer().context !== null;
const isSupported = () => getMixer().supported;

/** False when this browser turned out to have no Web Audio (world sounds can't play). */
export function useSoundSupported(): boolean {
  return useSyncExternalStore(subscribeMixer, isSupported, () => true);
}

/** True while world sound is actually playing (on, unlocked, tab visible). */
export function useSoundRunning(): boolean {
  return useSyncExternalStore(subscribeMixer, isRunning, () => false);
}
