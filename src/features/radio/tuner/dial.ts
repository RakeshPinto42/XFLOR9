/**
 * Dial maths. Positions are station slots in the current list (1..count), not radio
 * frequencies: Radio Browser doesn't provide FM frequencies, so we don't invent any.
 */

export const KNOB_MIN_DEG = -135;
export const KNOB_MAX_DEG = 135;
const SCALE_PAD = 4; // % kept clear at each end of the dial window

/** Where a station sits on the dial window, as a percentage from the left. */
export function scalePercent(index: number, count: number): number {
  if (count <= 1) return 50;
  return SCALE_PAD + (clampIndex(index, count) / (count - 1)) * (100 - 2 * SCALE_PAD);
}

/** Nearest station to a point on the dial window (0..1 across its width). */
export function indexFromScale(fraction: number, count: number): number {
  if (count <= 1) return 0;
  const pct = fraction * 100;
  const t = (pct - SCALE_PAD) / (100 - 2 * SCALE_PAD);
  return clampIndex(Math.round(t * (count - 1)), count);
}

/** Knob rotation for a station. */
export function knobAngle(index: number, count: number): number {
  if (count <= 1) return 0;
  return KNOB_MIN_DEG + (clampIndex(index, count) / (count - 1)) * (KNOB_MAX_DEG - KNOB_MIN_DEG);
}

/** Station for a knob rotation (degrees, 0 = pointing up, clockwise positive). */
export function indexFromAngle(angle: number, count: number): number {
  if (count <= 1) return 0;
  const a = Math.min(KNOB_MAX_DEG, Math.max(KNOB_MIN_DEG, normaliseAngle(angle)));
  return clampIndex(Math.round(((a - KNOB_MIN_DEG) / (KNOB_MAX_DEG - KNOB_MIN_DEG)) * (count - 1)), count);
}

/** Like a real dial, tuning stops at either end rather than wrapping around. */
export function stepIndex(index: number, delta: number, count: number): number {
  return clampIndex(index + delta, count);
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

/** Maps any angle into -180..180. */
export function normaliseAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/** Numbered marks to print on the dial (first, last and a few between). */
export function scaleLabels(count: number, max = 6): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const labels = new Set<number>();
  for (let k = 0; k < max; k++) labels.add(Math.round((k / (max - 1)) * (count - 1)));
  return [...labels];
}
