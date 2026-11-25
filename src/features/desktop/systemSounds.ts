"use client";

import { getMixer, soundPrefs } from "@/lib/sound/browser";
import { desktopPrefs } from "./store";

/**
 * The computer's own sounds, generated in the browser (Web Audio oscillators and filtered noise):
 * original, so there are no recordings to license, and nothing to download. They play on the
 * shared mixer's "effects" bus, so the master volume and mute apply. Nothing plays before the
 * visitor's first click or key press (browsers require it, and the welcome screen is that click).
 */

export type SystemSound = "startup" | "shutdown" | "logoff" | "open" | "minimize" | "restore" | "menu" | "error" | "notify";

type Note = { f: number; at: number; len: number; gain: number; type?: OscillatorType };

/** Small chords and blips; times in seconds from the start of the sound. */
const SOUNDS: Record<Exclude<SystemSound, "minimize" | "restore">, Note[]> = {
  // A warm rising Eb-major-9 swell with a bell on top: about three seconds.
  startup: [
    { f: 155.56, at: 0, len: 2.8, gain: 0.16, type: "triangle" },
    { f: 233.08, at: 0.12, len: 2.6, gain: 0.12, type: "triangle" },
    { f: 311.13, at: 0.3, len: 2.4, gain: 0.11 },
    { f: 392.0, at: 0.48, len: 2.2, gain: 0.1 },
    { f: 466.16, at: 0.66, len: 2.0, gain: 0.08 },
    { f: 698.46, at: 0.9, len: 1.8, gain: 0.07 },
    { f: 932.33, at: 1.1, len: 1.6, gain: 0.05 },
  ],
  // The start-up phrase falling back down.
  shutdown: [
    { f: 622.25, at: 0, len: 1.0, gain: 0.08 },
    { f: 466.16, at: 0.22, len: 1.0, gain: 0.09 },
    { f: 311.13, at: 0.44, len: 1.2, gain: 0.1, type: "triangle" },
    { f: 155.56, at: 0.66, len: 1.6, gain: 0.14, type: "triangle" },
  ],
  logoff: [
    { f: 523.25, at: 0, len: 0.5, gain: 0.08 },
    { f: 392.0, at: 0.15, len: 0.8, gain: 0.08, type: "triangle" },
  ],
  open: [
    { f: 880, at: 0, len: 0.09, gain: 0.05 },
    { f: 1318.5, at: 0.05, len: 0.12, gain: 0.04 },
  ],
  menu: [{ f: 1760, at: 0, len: 0.035, gain: 0.035, type: "square" }],
  error: [
    { f: 659.25, at: 0, len: 0.35, gain: 0.1, type: "triangle" },
    { f: 493.88, at: 0.12, len: 0.5, gain: 0.1, type: "triangle" },
  ],
  notify: [
    { f: 1046.5, at: 0, len: 0.4, gain: 0.07 },
    { f: 1567.98, at: 0.08, len: 0.5, gain: 0.05 },
  ],
};

export function playSystemSound(name: SystemSound) {
  if (!desktopPrefs.get().systemSounds || !soundPrefs.get().soundOn) return;
  const mixer = getMixer();
  const ctx = mixer.context as AudioContext | null;
  const bus = mixer.bus("effects") as AudioNode | null;
  if (!ctx || !bus || !mixer.acquireVoice()) return;
  const now = ctx.currentTime + 0.01;
  let end = now;
  try {
    if (name === "minimize" || name === "restore") end = sweep(ctx, bus, now, name === "minimize");
    else for (const n of SOUNDS[name]) end = Math.max(end, tone(ctx, bus, now, n));
  } finally {
    window.setTimeout(() => mixer.releaseVoice(), Math.max(50, (end - ctx.currentTime) * 1000 + 50));
  }
}

/**
 * Start-up needs the audio context running, which happens asynchronously right after the click
 * that unlocked it. Waits briefly for it instead of dropping the sound.
 */
export function playWhenReady(name: SystemSound, timeoutMs = 1500) {
  const mixer = getMixer();
  if (mixer.context) return playSystemSound(name);
  mixer.unlock();
  const stop = mixer.subscribe(() => {
    if (!mixer.context) return;
    stop();
    window.clearTimeout(t);
    playSystemSound(name);
  });
  const t = window.setTimeout(stop, timeoutMs);
}

function tone(ctx: AudioContext, out: AudioNode, t0: number, n: Note): number {
  const start = t0 + n.at;
  const stop = start + n.len;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = n.type ?? "sine";
  osc.frequency.value = n.f;
  // Soft attack, long exponential tail: a struck, bell-like envelope rather than a beep.
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(n.gain, start + Math.min(0.04, n.len / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, stop);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(stop + 0.02);
  return stop;
}

/** A short filtered-noise "whoosh", falling for minimise, rising for restore. */
function sweep(ctx: AudioContext, out: AudioNode, t0: number, down: boolean): number {
  const len = 0.22;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2.5;
  filter.frequency.setValueAtTime(down ? 2400 : 500, t0);
  filter.frequency.exponentialRampToValueAtTime(down ? 400 : 2600, t0 + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(filter).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + len + 0.02);
  return t0 + len;
}
