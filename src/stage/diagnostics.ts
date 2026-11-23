"use client";

/** Live renderer statistics, published from inside the canvas and read by the DOM panel. */
export interface StageStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
  level: string;
}

const EMPTY: StageStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 0, level: "-" };

let stats = EMPTY;
const listeners = new Set<() => void>();

export const stageStats = {
  get: () => stats,
  set(next: StageStats) {
    stats = next;
    listeners.forEach((l) => l());
  },
  reset() {
    stageStats.set(EMPTY);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  server: () => EMPTY,
};
