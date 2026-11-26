/**
 * Best results and settings for the Arcade, kept only in this browser (plain functions,
 * unit-tested). Stored data is untrusted: only well-formed numbers survive. Older saves (one Mines
 * best time, from before difficulty levels) still count, as the Beginner best.
 */

export const LEVELS = {
  beginner: { name: "Beginner", cols: 9, rows: 9, mines: 10 },
  intermediate: { name: "Intermediate", cols: 16, rows: 16, mines: 40 },
  expert: { name: "Expert", cols: 30, rows: 16, mines: 99 },
} as const;
export type Level = keyof typeof LEVELS;

export const SPEEDS = { slow: { name: "Slow", tickMs: 190 }, normal: { name: "Normal", tickMs: 130 }, fast: { name: "Fast", tickMs: 85 } } as const;
export type Speed = keyof typeof SPEEDS;

export interface Best {
  saanp: number;
  /** Fastest win per level, seconds; null until the first win. */
  mines: Record<Level, number | null>;
}

export interface ArcadePrefs {
  level: Level;
  speed: Speed;
  /** Most recent first. */
  recent: ("saanp" | "mines")[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const time = (v: unknown) => {
  const n = num(v);
  return n !== null && n > 0 && n < 100_000 ? Math.round(n) : null;
};

export function parseBest(raw: unknown): Best {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const saanp = num(r.saanp);
  const m = (typeof r.mines === "object" && r.mines !== null ? r.mines : {}) as Record<string, unknown>;
  return {
    saanp: saanp !== null && saanp >= 0 ? Math.floor(saanp) : 0,
    mines: {
      beginner: time(m.beginner) ?? time(r.minesSeconds),
      intermediate: time(m.intermediate),
      expert: time(m.expert),
    },
  };
}

export const recordSaanpScore = (b: Best, score: number): Best => (score > b.saanp ? { ...b, saanp: score } : b);

export function recordMinesWin(b: Best, level: Level, seconds: number): Best {
  const cur = b.mines[level];
  return cur === null || seconds < cur ? { ...b, mines: { ...b.mines, [level]: seconds } } : b;
}

export function parseArcadePrefs(raw: unknown): ArcadePrefs {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const recent = Array.isArray(r.recent) ? r.recent.filter((x): x is "saanp" | "mines" => x === "saanp" || x === "mines") : [];
  return {
    level: typeof r.level === "string" && Object.hasOwn(LEVELS, r.level) ? (r.level as Level) : "beginner",
    speed: typeof r.speed === "string" && Object.hasOwn(SPEEDS, r.speed) ? (r.speed as Speed) : "normal",
    recent: [...new Set(recent)].slice(0, 2),
  };
}

export const playedGame = (p: ArcadePrefs, id: "saanp" | "mines"): ArcadePrefs => ({ ...p, recent: [id, ...p.recent.filter((x) => x !== id)] });
