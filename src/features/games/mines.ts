/** Mines (minefield puzzle) rules, pure and framework-free so they can be unit-tested. */

export interface Cell {
  mine: boolean;
  /** Mines in the 8 neighbouring cells. */
  near: number;
  open: boolean;
  flag: boolean;
}
export type MinesStatus = "ready" | "playing" | "won" | "lost";
export interface MinesState {
  cols: number;
  rows: number;
  mines: number;
  cells: Cell[];
  status: MinesStatus;
}

export function newMinesGame(cols = 9, rows = 9, mines = 10): MinesState {
  if (mines >= cols * rows - 9) throw new Error("Too many mines for the board");
  const cells = Array.from({ length: cols * rows }, () => ({ mine: false, near: 0, open: false, flag: false }));
  return { cols, rows, mines, cells, status: "ready" };
}

export function neighbours(s: Pick<MinesState, "cols" | "rows">, i: number): number[] {
  const x = i % s.cols;
  const y = Math.floor(i / s.cols);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < s.cols && ny < s.rows) out.push(ny * s.cols + nx);
    }
  return out;
}

/** Mines are laid on the first reveal, away from that cell, so the first move is always safe. */
function layMines(s: MinesState, safe: number, rng: () => number): Cell[] {
  const keepClear = new Set([safe, ...neighbours(s, safe)]);
  const spots = s.cells.map((_, i) => i).filter((i) => !keepClear.has(i));
  const cells = s.cells.map((c) => ({ ...c }));
  for (let n = 0; n < s.mines; n++) {
    const pick = Math.floor(rng() * spots.length);
    cells[spots[pick]].mine = true;
    spots.splice(pick, 1);
  }
  cells.forEach((c, i) => (c.near = neighbours(s, i).filter((j) => cells[j].mine).length));
  return cells;
}

export function reveal(s: MinesState, i: number, rng: () => number = Math.random): MinesState {
  if (s.status === "won" || s.status === "lost" || s.cells[i].open || s.cells[i].flag) return s;
  const cells = s.status === "ready" ? layMines(s, i, rng) : s.cells.map((c) => ({ ...c }));
  if (cells[i].mine) {
    cells.forEach((c) => c.mine && (c.open = true));
    return { ...s, cells, status: "lost" };
  }
  // Flood-open empty areas.
  const stack = [i];
  while (stack.length) {
    const j = stack.pop()!;
    const c = cells[j];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.near === 0) stack.push(...neighbours(s, j));
  }
  const won = cells.every((c) => c.mine || c.open);
  return { ...s, cells, status: won ? "won" : "playing" };
}

export function toggleFlag(s: MinesState, i: number): MinesState {
  if (s.status !== "playing" || s.cells[i].open) return s;
  const cells = s.cells.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c));
  return { ...s, cells };
}

export function flagsLeft(s: MinesState): number {
  return s.mines - s.cells.filter((c) => c.flag).length;
}
