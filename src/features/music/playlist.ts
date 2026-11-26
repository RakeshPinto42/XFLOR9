/**
 * The Music player's playlist rules as plain functions (unit-tested): what plays next with
 * shuffle and repeat, skipping songs that couldn't play, and editing the list (add, remove,
 * move, clear) while keeping the current song's place.
 */

export type Repeat = "off" | "all" | "one";

export interface Playlist {
  /** Track ids, in order. The same track may appear twice. */
  items: string[];
  /** Position of the current song, or -1 when nothing is selected. */
  index: number;
  shuffle: boolean;
  repeat: Repeat;
}

export const EMPTY_PLAYLIST: Playlist = { items: [], index: -1, shuffle: false, repeat: "off" };
export const MAX_ITEMS = 500;

/** Saved playlists may be old or edited by hand: keep only known tracks, fix the position. */
export function parsePlaylist(raw: unknown, known: { has(id: string): boolean }): Playlist {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(r.items) ? r.items.filter((x): x is string => typeof x === "string" && known.has(x)).slice(0, MAX_ITEMS) : [];
  const index = typeof r.index === "number" && Number.isInteger(r.index) && r.index >= 0 && r.index < items.length ? r.index : items.length ? 0 : -1;
  return {
    items,
    index,
    shuffle: r.shuffle === true,
    repeat: r.repeat === "all" || r.repeat === "one" ? r.repeat : "off",
  };
}

export interface StepOptions {
  /** True when a song ended by itself (repeat-one replays it); false for the Next/Previous buttons. */
  auto: boolean;
  /** Track ids that couldn't play this visit; they're passed over. */
  skip?: ReadonlySet<string>;
  random?: () => number;
}

/** The position to play next (or previous), or -1 to stop. */
export function step(p: Playlist, dir: 1 | -1, o: StepOptions): number {
  const n = p.items.length;
  if (n === 0) return -1;
  const playable = (i: number) => !o.skip?.has(p.items[i]);
  if (o.auto && p.repeat === "one" && p.index >= 0 && playable(p.index)) return p.index;

  if (p.shuffle && dir === 1) {
    const candidates = [];
    for (let i = 0; i < n; i++) if (i !== p.index && playable(i)) candidates.push(i);
    if (candidates.length === 0) return p.repeat !== "off" && p.index >= 0 && playable(p.index) ? p.index : -1;
    return candidates[Math.floor((o.random ?? Math.random)() * candidates.length) % candidates.length];
  }

  let i = p.index;
  for (let k = 0; k < n; k++) {
    i += dir;
    if (i < 0 || i >= n) {
      if (p.repeat !== "all") return -1;
      i = (i + n) % n;
    }
    if (playable(i)) return i;
  }
  return -1;
}

export function append(p: Playlist, ids: readonly string[]): Playlist {
  const items = [...p.items, ...ids].slice(0, MAX_ITEMS);
  return { ...p, items, index: p.index < 0 && items.length ? 0 : p.index };
}

export function replaceAll(p: Playlist, ids: readonly string[], start = 0): Playlist {
  const items = ids.slice(0, MAX_ITEMS);
  return { ...p, items, index: items.length ? Math.min(Math.max(0, start), items.length - 1) : -1 };
}

export function removeAt(p: Playlist, i: number): Playlist {
  if (i < 0 || i >= p.items.length) return p;
  const items = p.items.filter((_, k) => k !== i);
  let index = p.index;
  if (i < index) index--;
  else if (i === index) index = Math.min(index, items.length - 1);
  return { ...p, items, index: items.length ? index : -1 };
}

/** Move one entry up (-1) or down (+1); the current song keeps playing wherever it moves. */
export function move(p: Playlist, i: number, dir: 1 | -1): Playlist {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= p.items.length || j >= p.items.length) return p;
  const items = [...p.items];
  [items[i], items[j]] = [items[j], items[i]];
  const index = p.index === i ? j : p.index === j ? i : p.index;
  return { ...p, items, index };
}

export function clear(p: Playlist): Playlist {
  return { ...p, items: [], index: -1 };
}

/** m:ss for the player display; "--:--" when unknown. */
export function clock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
