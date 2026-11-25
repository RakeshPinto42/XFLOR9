/**
 * A1 — the shared audio engine: one AudioContext, buses with remembered volumes, unlock on the
 * visitor's gesture, ducking, fades and a voice limit. Plain TypeScript (no React, no three.js);
 * the browser wiring lives in src/lib/sound/.
 *
 *   sources ──► ambience ─┐
 *               music ────┼──► master ──► speakers
 *               effects ──┤
 *               dialogue ─┘
 *
 * Radio streams are NOT routed here (other sites' streams don't permit Web Audio access; routing
 * them would silence them). The radio follows `radioOutput()` through its element's own volume.
 */

export const BUSES = ["ambience", "music", "effects", "dialogue"] as const;
export type Bus = (typeof BUSES)[number];

export interface SoundPrefs {
  /** The world's sounds (rain, thunder…): off until the visitor turns them on. */
  soundOn: boolean;
  /** Overall volume (also scales the radio). */
  master: number;
  ambience: number;
  /** Music, including the radio. */
  music: number;
  effects: number;
  dialogue: number;
  /** Softens thunder and other sharp sounds. */
  reduceSudden: boolean;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  soundOn: false,
  master: 0.8,
  ambience: 0.8,
  music: 1,
  effects: 0.8,
  dialogue: 1,
  reduceSudden: false,
};

/** How far ambience dips while the radio plays. */
export const DUCK_LEVEL = 0.35;
/** Most sounds playing at once; extra one-shots are skipped, never queued. */
export const MAX_VOICES = 24;
export const SPEED_OF_SOUND = 343; // metres per second
/** Fade time for volume changes (seconds; a time constant, ~3× this to settle). */
export const FADE = 0.12;

const unit = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** Saved settings may be old, corrupted or edited by hand: every field falls back on its own. */
export function parseSoundPrefs(raw: unknown): SoundPrefs {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SOUND_PREFS;
  return {
    soundOn: r.soundOn === true,
    master: unit(r.master, d.master),
    ambience: unit(r.ambience, d.ambience),
    music: unit(r.music, d.music),
    effects: unit(r.effects, d.effects),
    dialogue: unit(r.dialogue, d.dialogue),
    reduceSudden: r.reduceSudden === true,
  };
}

/** Volume of one bus (before the master), including ducking while a player (radio, TV, music) plays. */
export function busGain(p: SoundPrefs, bus: Bus, mediaPlaying: boolean): number {
  return p[bus] * (bus === "ambience" && mediaPlaying ? DUCK_LEVEL : 1);
}

/** Overall output: silent unless the visitor turned sound on. */
export function masterGain(p: SoundPrefs): number {
  return p.soundOn ? p.master : 0;
}

/** What the radio element gets on top of its own volume (master × music). */
export function radioOutput(p: SoundPrefs): number {
  return p.master * p.music;
}

/** Seconds between a lightning flash and its thunder at this distance. */
export function thunderDelay(distanceMetres: number): number {
  return Math.max(0, distanceMetres) / SPEED_OF_SOUND;
}

/** Loudness factor for sudden sounds (thunder). */
export function suddenGain(p: SoundPrefs): number {
  return p.reduceSudden ? 0.35 : 1;
}

// ---------- the mixer ------------------------------------------------------------------------

/** The parts of Web Audio the mixer uses (lets tests supply a fake). */
export interface GainLike {
  gain: { value: number; setTargetAtTime(v: number, t: number, c: number): unknown };
  connect(dest: unknown): unknown;
}
export interface ContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export class AudioMixer {
  private ctx: ContextLike | null = null;
  private master: GainLike | null = null;
  private buses = new Map<Bus, GainLike>();
  private prefs: SoundPrefs = DEFAULT_SOUND_PREFS;
  /** Players currently playing ("radio", "tv", "music"): ambience dips while any is. */
  private mediaPlaying = new Set<string>();
  private hidden = false;
  private voices = 0;
  private listeners = new Set<() => void>();
  private unsupported = false;
  private readonly createContext: () => ContextLike | null;

  /** `createContext` returns null when this browser has no Web Audio. */
  constructor(createContext: () => ContextLike | null) {
    this.createContext = createContext;
  }

  /** False once we know this browser can't play generated sound (no Web Audio). */
  get supported(): boolean {
    return !this.unsupported;
  }

  /** The running context, or null until sound is on AND the visitor has interacted. */
  get context(): ContextLike | null {
    return this.ctx && this.ctx.state === "running" ? this.ctx : null;
  }

  /** Where a source for this bus connects (null while there is no running context). */
  bus(name: Bus): GainLike | null {
    return this.context ? (this.buses.get(name) ?? null) : null;
  }

  get settings(): SoundPrefs {
    return this.prefs;
  }

  /** Notified when the context starts or stops (scenes start their sounds then). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setPrefs(prefs: SoundPrefs) {
    const wasOn = this.prefs.soundOn;
    this.prefs = prefs;
    this.applyGains();
    // Turning sound off releases the hardware; turning it on waits for unlock() (a gesture).
    if (wasOn && !prefs.soundOn && this.ctx?.state === "running") void this.ctx.suspend().then(() => this.emit());
  }

  /** A player (radio, TV, music) started or stopped. Each reports for itself, so one stopping never un-ducks another. */
  setMediaPlaying(player: string, playing: boolean) {
    if (playing) this.mediaPlaying.add(player);
    else this.mediaPlaying.delete(player);
    this.applyGains();
  }

  /**
   * Call from a user gesture (click, key). Browsers only allow audio to start from one, so
   * nothing ever plays before the visitor interacts. Does nothing while sound is off.
   */
  unlock() {
    if (!this.prefs.soundOn || this.hidden || this.unsupported) return;
    if (!this.ctx) {
      const ctx = this.createContext();
      if (!ctx) {
        this.unsupported = true;
        this.emit();
        return;
      }
      this.ctx = ctx;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      for (const b of BUSES) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.buses.set(b, g);
      }
      this.applyGains();
    }
    if (this.ctx.state !== "running") void this.ctx.resume().then(() => this.emit());
    else this.emit();
  }

  /** Hidden tab: fade out and suspend; visible again: resume (sound fades back in). */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.applyGains();
    if (!this.ctx) return;
    if (hidden && this.ctx.state === "running") void this.ctx.suspend().then(() => this.emit());
    if (!hidden && this.prefs.soundOn && this.ctx.state !== "running") void this.ctx.resume().then(() => this.emit());
  }

  /** Reserve a voice for a one-shot; false = too many sounds playing, skip this one. */
  acquireVoice(): boolean {
    if (this.voices >= MAX_VOICES) return false;
    this.voices++;
    return true;
  }

  releaseVoice() {
    this.voices = Math.max(0, this.voices - 1);
  }

  get activeVoices(): number {
    return this.voices;
  }

  private applyGains() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.hidden ? 0 : masterGain(this.prefs), t, FADE);
    for (const [b, g] of this.buses) g.gain.setTargetAtTime(busGain(this.prefs, b, this.mediaPlaying.size > 0), t, FADE);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}
