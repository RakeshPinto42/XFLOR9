"use client";

import { parseQualityPreference, type DeviceSignals } from "@/engine/quality";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";

/** The visitor's quality choice (Automatic by default), remembered in this browser. */
export const qualityPreference = createLocalStore(STORAGE_KEYS.stageQuality, "auto", parseQualityPreference);

let webglCache: boolean | null = null;
function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function readSignals(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    webgl: hasWebGL(),
    saveData: nav.connection?.saveData === true,
    deviceMemoryGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null,
  };
}

/** Re-evaluates when the reduced-motion setting changes. */
export function subscribeSignals(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Diagnostics panel without the free camera (?stage-stats): measure the real cinematic camera. */
export function statsRequested(): boolean {
  return new URLSearchParams(window.location.search).has("stage-stats");
}

/** Diagnostics are on in development, or with ?stage-debug in the address. */
export function debugRequested(): boolean {
  const q = new URLSearchParams(window.location.search);
  if (q.has("stage-nodebug")) return false; // preview the real (cinematic) camera in development
  return process.env.NODE_ENV === "development" || q.has("stage-debug");
}
