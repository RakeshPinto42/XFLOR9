/**
 * Adaptive quality for Full mode. Frame times are watched continuously; when they stay too
 * slow, quality steps down one level at a time; it steps back up only after a long stretch of
 * comfortable frames (hysteresis), so quality doesn't flicker. Below the lowest level the
 * advice is to switch to Lite.
 */

export interface QualityLevel {
  name: string;
  /** Maximum device pixel ratio. */
  maxDpr: number;
  shadows: boolean;
  /** Post-processing (glow, vignette, grain). */
  effects: boolean;
  /** 0..1 share of particles (rain, dust). */
  particles: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { name: "high", maxDpr: 2, shadows: true, effects: true, particles: 1 },
  { name: "medium", maxDpr: 1.5, shadows: true, effects: true, particles: 0.7 },
  { name: "low", maxDpr: 1.25, shadows: false, effects: true, particles: 0.5 },
  { name: "minimal", maxDpr: 1, shadows: false, effects: false, particles: 0.3 },
];

export interface AdaptiveOptions {
  /** Frames are judged in windows of this many seconds. */
  windowSeconds: number;
  /** Step down when a window's median frame time is above this (ms). */
  slowMs: number;
  /** ...for this many consecutive windows. */
  slowWindows: number;
  /** Step up when a window's median is below this (ms)... */
  fastMs: number;
  /** ...for this many consecutive windows. */
  fastWindows: number;
}

/** Target 60 fps (16.7 ms): below ~45 fps for 3 s steps down; above ~80 fps for 10 s steps up. */
export const DEFAULT_ADAPTIVE: AdaptiveOptions = { windowSeconds: 1, slowMs: 22, slowWindows: 3, fastMs: 12.5, fastWindows: 10 };

export type AdaptiveEvent = { type: "down" | "up"; level: number } | { type: "suggest-lite" } | null;

export class AdaptiveQuality {
  level = 0;
  private samples: number[] = [];
  private elapsed = 0;
  private slowRun = 0;
  private fastRun = 0;
  lastMedianMs = 0;

  constructor(
    private readonly opts: AdaptiveOptions = DEFAULT_ADAPTIVE,
    private readonly levels: readonly QualityLevel[] = QUALITY_LEVELS,
  ) {}

  get current(): QualityLevel {
    return this.levels[this.level];
  }

  /** Feed one frame's duration (ms). Returns an event when the level should change. */
  frame(ms: number): AdaptiveEvent {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    // Ignore pauses (tab switch, debugger): they say nothing about rendering speed.
    if (ms > 250) return null;
    this.samples.push(ms);
    this.elapsed += ms;
    if (this.elapsed < this.opts.windowSeconds * 1000) return null;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.lastMedianMs = median;
    this.samples = [];
    this.elapsed = 0;

    if (median > this.opts.slowMs) {
      this.slowRun += 1;
      this.fastRun = 0;
      if (this.slowRun >= this.opts.slowWindows) {
        this.slowRun = 0;
        if (this.level < this.levels.length - 1) {
          this.level += 1;
          return { type: "down", level: this.level };
        }
        return { type: "suggest-lite" };
      }
    } else if (median < this.opts.fastMs) {
      this.fastRun += 1;
      this.slowRun = 0;
      if (this.fastRun >= this.opts.fastWindows && this.level > 0) {
        this.fastRun = 0;
        this.level -= 1;
        return { type: "up", level: this.level };
      }
    } else {
      this.slowRun = 0;
      this.fastRun = 0;
    }
    return null;
  }
}
