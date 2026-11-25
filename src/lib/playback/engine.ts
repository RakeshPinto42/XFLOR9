import type { PlaybackError, PlaybackErrorKind, PlaybackSource, PlaybackState } from "./types";

/**
 * The one audio engine for the whole site.
 *
 * - Owns a single <audio> element that lives outside React, so page navigation never
 *   interrupts it and two streams can never play at once (there is only one element).
 * - Exposes a tiny store (subscribe/getState) that React reads with useSyncExternalStore.
 * - Every load gets a generation number; events from an older stream are ignored, so a
 *   late error from the previous station can't break the new one.
 */

/** The subset of HTMLAudioElement we use. A fake implements it in tests. */
export interface AudioLike extends EventTarget {
  src: string;
  preload: string;
  volume: number;
  muted: boolean;
  readonly paused: boolean;
  readonly error: { code: number } | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

export interface CrossTabChannel {
  post(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
}

export interface EngineDeps {
  createAudio: () => AudioLike;
  isOnline: () => boolean;
  /** Subscribe to browser online/offline changes. */
  onConnectivityChange: (handler: (online: boolean) => void) => void;
  loadPrefs: () => { volume: number; muted: boolean };
  savePrefs: (prefs: { volume: number; muted: boolean }) => void;
  channel?: CrossTabChannel | null;
  onStateChange?: (state: PlaybackState) => void; // e.g. Media Session sync
}

export const LOAD_TIMEOUT_MS = 15_000;
export const BUFFER_TIMEOUT_MS = 20_000;

// HTMLMediaElement error codes
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

const MESSAGES: Record<PlaybackErrorKind, string> = {
  offline: "You're offline. Reconnect to the internet, then retry.",
  network: "The station isn't responding. It may be off air right now.",
  unplayable: "Couldn't open this station. It may be off air, or its stream may not work in this browser.",
  decode: "The stream arrived but couldn't be decoded.",
  timeout: "The station took too long to answer. It may be off air or overloaded.",
  blocked: "Your browser blocked playback. Press play to start.",
};

export interface LoadOptions {
  /** Called once, the first time this load actually starts producing sound. */
  onStarted?: () => void;
}

export class PlaybackEngine {
  private readonly audio: AudioLike;
  private state: PlaybackState;
  private listeners = new Set<() => void>();
  private generation = 0;
  private activeUrl: string | null = null; // null while we have deliberately released the stream
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onStarted: (() => void) | undefined;
  private readonly tabId = Math.random().toString(36).slice(2);
  /** Site-wide sound settings applied on top of the player's own volume (A1 mixer). */
  private output = { gain: 1, mute: false };

  constructor(private readonly deps: EngineDeps) {
    this.audio = deps.createAudio();
    this.audio.preload = "none";
    const prefs = deps.loadPrefs();
    this.audio.volume = clamp(prefs.volume);
    this.audio.muted = prefs.muted;

    this.state = {
      status: "idle",
      source: null,
      error: null,
      volume: clamp(prefs.volume),
      muted: prefs.muted,
      volumeControllable: detectVolumeControl(this.audio, clamp(prefs.volume)),
    };

    this.bindAudioEvents();
    deps.onConnectivityChange((online) => {
      if (!online && this.isActive()) this.fail("offline");
    });
    deps.channel?.onMessage((msg) => {
      // Another XPLOR9 tab started playing: step aside so two streams never overlap.
      if (isRecord(msg) && msg.type === "started" && msg.tabId !== this.tabId && this.isActive()) this.pause();
    });
  }

  // ---------- store ----------
  getState = (): PlaybackState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // ---------- commands ----------
  /** Start a source. Replaces whatever is playing. */
  load(source: PlaybackSource, options: LoadOptions = {}) {
    this.onStarted = options.onStarted;
    this.set({ source, error: null });
    this.start();
  }

  /** Resume the current source (live streams reconnect to the live edge). */
  play() {
    if (!this.state.source) return;
    if (this.state.status === "playing" || this.state.status === "loading" || this.state.status === "buffering") return;
    this.start();
  }

  pause() {
    if (!this.state.source) return;
    this.clearTimer();
    this.generation++; // late events from the paused stream are now stale
    if (this.state.source.live) this.release();
    else this.audio.pause();
    this.set({ status: "paused", error: null });
  }

  toggle() {
    if (this.isActive()) this.pause();
    else this.play();
  }

  /** Stop and forget the current source; the mini-player disappears. */
  stop() {
    this.clearTimer();
    this.generation++;
    this.release();
    this.onStarted = undefined;
    this.set({ status: "idle", source: null, error: null });
  }

  setVolume(value: number) {
    const volume = clamp(value);
    const muted = volume === 0 ? this.state.muted : false; // moving the slider up unmutes
    this.set({ volume, muted });
    this.applyOutput();
    this.deps.savePrefs({ volume, muted });
  }

  toggleMute() {
    const muted = !this.state.muted;
    this.set({ muted });
    this.applyOutput();
    this.deps.savePrefs({ volume: this.state.volume, muted });
  }

  /**
   * Site-wide sound settings (master × music volume, and the site's sound-off switch). They scale
   * the element's own volume: the stream itself is never routed through Web Audio (other sites'
   * streams don't permit it, and routing them would silence them). The player's saved volume and
   * mute are unchanged.
   */
  setOutput(gain: number, mute: boolean) {
    this.output = { gain: clamp(gain), mute };
    this.applyOutput();
  }

  private applyOutput() {
    this.audio.volume = clamp(this.state.volume * this.output.gain);
    this.audio.muted = this.state.muted || this.output.mute;
  }

  /** Which MIME types this browser says it can decode (used for per-browser playability). */
  canPlayType(mimeType: string): string {
    const a = this.audio as unknown as { canPlayType?: (t: string) => string };
    return typeof a.canPlayType === "function" ? a.canPlayType(mimeType) : "";
  }

  // ---------- internals ----------
  private start() {
    const source = this.state.source;
    if (!source) return;
    this.clearTimer();
    const gen = ++this.generation;

    // A paused or finished track carries on in place (from where it paused; from the start after
    // its end): only live streams have to reconnect.
    if (!source.live && this.activeUrl === source.url && (this.state.status === "paused" || this.state.status === "ended")) {
      this.set({ status: "loading", error: null });
      this.armTimer(gen, LOAD_TIMEOUT_MS, "timeout");
      this.playElement(gen);
      return;
    }

    if (!this.deps.isOnline()) {
      this.release();
      this.fail("offline");
      return;
    }

    this.set({ status: "loading", error: null });
    this.activeUrl = source.url;
    this.audio.src = source.url;
    this.audio.load();
    this.armTimer(gen, LOAD_TIMEOUT_MS, "timeout");

    this.playElement(gen);
  }

  private playElement(gen: number) {
    this.audio.play().catch((err: unknown) => {
      if (gen !== this.generation) return;
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return; // superseded by a newer load or a pause
      if (name === "NotAllowedError") this.fail("blocked");
      else if (name === "NotSupportedError") this.fail("unplayable");
      else this.fail("network");
    });
    this.deps.channel?.post({ type: "started", tabId: this.tabId });
  }

  private bindAudioEvents() {
    const on = (type: string, handler: () => void) => this.audio.addEventListener(type, handler);
    on("playing", () => {
      if (!this.isCurrent()) return;
      this.clearTimer();
      this.set({ status: "playing", error: null });
      const started = this.onStarted;
      this.onStarted = undefined; // once per load
      started?.();
    });
    on("waiting", () => {
      if (!this.isCurrent() || this.state.status !== "playing") return;
      this.set({ status: "buffering" });
      this.armTimer(this.generation, BUFFER_TIMEOUT_MS, "network");
    });
    on("pause", () => {
      // Paused by something other than us (OS media key, headphones unplugged).
      if (this.isCurrent() && (this.state.status === "playing" || this.state.status === "buffering")) this.pause();
    });
    on("ended", () => {
      if (!this.isCurrent()) return;
      // A live stream "ending" means the broadcaster dropped the connection; a track simply ended.
      if (this.state.source?.live) this.fail("network");
      else {
        this.clearTimer();
        this.set({ status: "ended", error: null });
      }
    });
    on("error", () => {
      if (!this.isCurrent()) return;
      const code = this.audio.error?.code;
      if (code === MEDIA_ERR_ABORTED) return;
      if (!this.deps.isOnline()) this.fail("offline");
      else if (code === MEDIA_ERR_SRC_NOT_SUPPORTED) this.fail("unplayable");
      else if (code === MEDIA_ERR_DECODE) this.fail("decode");
      else if (code === MEDIA_ERR_NETWORK) this.fail("network");
      else this.fail("network");
    });
  }

  /** True if the element is still working on the stream we asked for (not a released/old one). */
  private isCurrent(): boolean {
    return this.activeUrl !== null && (this.state.status === "loading" || this.state.status === "playing" || this.state.status === "buffering");
  }

  private isActive(): boolean {
    return this.state.status === "loading" || this.state.status === "playing" || this.state.status === "buffering";
  }

  private fail(kind: PlaybackErrorKind) {
    this.clearTimer();
    this.generation++;
    this.release();
    const error: PlaybackError = { kind, message: MESSAGES[kind] };
    this.set({ status: "error", error });
  }

  /** Stop downloading entirely (a paused live stream would otherwise keep streaming). */
  private release() {
    this.activeUrl = null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  private armTimer(gen: number, ms: number, kind: PlaybackErrorKind) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (gen === this.generation) this.fail(kind);
    }, ms);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    this.deps.onStateChange?.(this.state);
    for (const l of this.listeners) l();
  }
}

export function clamp(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/** iOS ignores volume writes from web pages; detect it by writing and reading back. */
function detectVolumeControl(audio: AudioLike, restore: number): boolean {
  const probe = restore === 0.5 ? 0.4 : 0.5;
  audio.volume = probe;
  const works = Math.abs(audio.volume - probe) < 0.01;
  audio.volume = restore;
  return works;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
