/**
 * Quality modes for 3D scenes (shared by the public site and the future Studio).
 *   full  – real-time 3D
 *   lite  – an image rendered from the same scene, with light CSS motion
 *   still – the same image, no motion
 * Real text and controls are always ordinary page content above the scene.
 */
export type QualityMode = "full" | "lite" | "still";
export type QualityPreference = "auto" | QualityMode;

export const QUALITY_PREFERENCES: readonly QualityPreference[] = ["auto", "full", "lite", "still"];

export const QUALITY_LABELS: Record<QualityPreference, string> = {
  auto: "Automatic",
  full: "Full 3D",
  lite: "Lite",
  still: "Still",
};

/** What the browser tells us about the device (all optional signals; missing = unknown). */
export interface DeviceSignals {
  reducedMotion: boolean;
  webgl: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB (Chromium only). */
  deviceMemoryGB: number | null;
  /** navigator.hardwareConcurrency. */
  cores: number | null;
}

export interface ModeDecision {
  mode: QualityMode;
  /** Plain-language reason, shown in diagnostics and to the visitor when it matters. */
  reason: string;
}

export function parseQualityPreference(raw: unknown): QualityPreference {
  return typeof raw === "string" && (QUALITY_PREFERENCES as readonly string[]).includes(raw) ? (raw as QualityPreference) : "auto";
}

/**
 * Picks the mode. An explicit choice wins, except that Full needs WebGL. Automatic choice:
 * reduced motion → still; no WebGL, data saver or a clearly low-end device → lite; else full.
 */
export function chooseMode(pref: QualityPreference, s: DeviceSignals): ModeDecision {
  if (pref !== "auto") {
    if (pref === "full" && !s.webgl) return { mode: "lite", reason: "This browser can't show 3D (WebGL is unavailable)." };
    return { mode: pref, reason: `You chose ${QUALITY_LABELS[pref]}.` };
  }
  if (s.reducedMotion) return { mode: "still", reason: "Your device asks for reduced motion." };
  if (!s.webgl) return { mode: "lite", reason: "This browser can't show 3D (WebGL is unavailable)." };
  if (s.saveData) return { mode: "lite", reason: "Data saver is on." };
  if ((s.deviceMemoryGB !== null && s.deviceMemoryGB < 4) || (s.cores !== null && s.cores < 4))
    return { mode: "lite", reason: "This device may struggle with real-time 3D." };
  return { mode: "full", reason: "Your device can show real-time 3D." };
}
