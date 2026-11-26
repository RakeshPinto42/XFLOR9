/**
 * The graphic equaliser's settings (plain data, unit-tested). Ten bands at the frequencies
 * classic players used, ±12 dB each, plus a preamp. Applied by audioGraph.ts with Web Audio
 * peaking filters, only to audio the browser lets us process (the public-domain records).
 */

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;
export const EQ_LIMIT = 12;

export interface EqSettings {
  enabled: boolean;
  /** dB, -12..12. */
  preamp: number;
  /** dB per band, -12..12, one per EQ_BANDS entry. */
  gains: number[];
}

const flat = () => EQ_BANDS.map(() => 0);
export const DEFAULT_EQ: EqSettings = { enabled: true, preamp: 0, gains: flat() };

/** Starting points; every slider can still be moved by hand. */
export const EQ_PRESETS: Record<string, number[]> = {
  Flat: flat(),
  "Bass boost": [8, 6, 4, 1, 0, 0, 0, 0, 0, 0],
  "Treble boost": [0, 0, 0, 0, 0, 2, 4, 6, 7, 8],
  Vocal: [-3, -2, 0, 3, 5, 5, 3, 1, 0, -1],
  "Old record": [-8, -4, 0, 3, 4, 3, 0, -4, -8, -10],
  Rock: [5, 3, -2, -4, -1, 2, 5, 6, 6, 6],
  Pop: [-1, 2, 4, 5, 3, 0, -1, -1, -1, -1],
  Classical: [0, 0, 0, 0, 0, 0, -4, -4, -4, -6],
};

const db = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.min(EQ_LIMIT, Math.max(-EQ_LIMIT, Math.round(v * 10) / 10)) : fallback);

export function parseEq(raw: unknown): EqSettings {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const gains = Array.isArray(r.gains) && r.gains.length === EQ_BANDS.length ? r.gains.map((g) => db(g)) : flat();
  return { enabled: r.enabled !== false, preamp: db(r.preamp), gains };
}

/** Which preset these gains match exactly, if any (shown in the preset menu). */
export function presetName(gains: readonly number[]): string | null {
  for (const [name, g] of Object.entries(EQ_PRESETS)) if (g.every((v, i) => v === gains[i])) return name;
  return null;
}

/** Band label: 60, 170 … 1K, 3K … 16K. */
export function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}K` : String(hz);
}
