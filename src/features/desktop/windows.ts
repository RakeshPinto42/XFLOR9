/**
 * The window manager's rules as plain TypeScript (no React, no DOM), so they are unit-tested:
 * opening, focusing (z-order), minimising, maximising, moving and resizing, always keeping a
 * window's title bar reachable inside the desktop area.
 *
 * Each app has at most one window (its id is the app id): opening an open app brings it forward.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface WindowState extends Rect {
  id: string;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

export interface Desktop {
  windows: WindowState[];
  /** Next z-index to hand out. */
  topZ: number;
}

export const EMPTY_DESKTOP: Desktop = { windows: [], topZ: 1 };

/** How much of a title bar must stay inside the desktop, so a window can always be dragged back. */
export const KEEP_VISIBLE = 80;
export const TITLE_BAR = 30;
const CASCADE = 28;

/** The window that has focus: the highest one that isn't minimised. */
export function focusedId(d: Desktop): string | null {
  let best: WindowState | null = null;
  for (const w of d.windows) if (!w.minimized && (!best || w.z > best.z)) best = w;
  return best?.id ?? null;
}

/** Size a window to fit the area (never larger than it, never smaller than its minimum when there is room). */
export function fitSize(want: Size, min: Size, area: Size): Size {
  return {
    w: Math.round(Math.max(Math.min(want.w, area.w), Math.min(min.w, area.w))),
    h: Math.round(Math.max(Math.min(want.h, area.h), Math.min(min.h, area.h))),
  };
}

/** Keep the title bar reachable: at least KEEP_VISIBLE px horizontally, top edge inside the area. */
export function clampRect(r: Rect, area: Size): Rect {
  const x = Math.min(Math.max(r.x, KEEP_VISIBLE - r.w), area.w - KEEP_VISIBLE);
  const y = Math.min(Math.max(r.y, 0), Math.max(0, area.h - TITLE_BAR));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(r.w), h: Math.round(r.h) };
}

export interface OpenOptions {
  id: string;
  size: Size;
  min: Size;
  area: Size;
  /** Where this window was last time (remembered per app), if anywhere. */
  remembered?: Rect | null;
}

export function openWindow(d: Desktop, o: OpenOptions): Desktop {
  const existing = d.windows.find((w) => w.id === o.id);
  if (existing) return focusWindow(d, o.id);

  let rect: Rect;
  if (o.remembered) {
    const s = fitSize({ w: o.remembered.w, h: o.remembered.h }, o.min, o.area);
    rect = clampRect({ ...o.remembered, ...s }, o.area);
  } else {
    // Cascade from the top-left, the way new windows always opened, wrapping before the edge.
    const s = fitSize(o.size, o.min, o.area);
    const open = d.windows.filter((w) => !w.minimized).length;
    const step = open * CASCADE;
    const maxX = Math.max(0, o.area.w - s.w);
    const maxY = Math.max(0, o.area.h - s.h);
    const baseX = Math.min(Math.max(24, Math.round((o.area.w - s.w) / 4)), maxX);
    const baseY = Math.min(16, maxY);
    rect = { x: wrap(baseX + step, baseX, maxX), y: wrap(baseY + step, baseY, maxY), ...s };
  }
  const win: WindowState = { id: o.id, ...rect, z: d.topZ, minimized: false, maximized: false };
  return { windows: [...d.windows, win], topZ: d.topZ + 1 };
}

function wrap(v: number, base: number, max: number): number {
  if (max <= base) return Math.max(0, Math.min(base, max));
  return base + ((v - base) % (max - base + 1));
}

export function closeWindow(d: Desktop, id: string): Desktop {
  return { ...d, windows: d.windows.filter((w) => w.id !== id) };
}

/** Bring forward (and restore if minimised). */
export function focusWindow(d: Desktop, id: string): Desktop {
  const w = d.windows.find((x) => x.id === id);
  if (!w) return d;
  if (!w.minimized && w.z === d.topZ - 1) return d;
  return update({ ...d, topZ: d.topZ + 1 }, id, { z: d.topZ, minimized: false });
}

export function minimizeWindow(d: Desktop, id: string): Desktop {
  return update(d, id, { minimized: true });
}

export function toggleMaximize(d: Desktop, id: string): Desktop {
  const w = d.windows.find((x) => x.id === id);
  if (!w) return d;
  return update(focusWindow(d, id), id, { maximized: !w.maximized });
}

/** Taskbar button: focused → minimise; otherwise restore and bring forward. */
export function taskbarClick(d: Desktop, id: string): Desktop {
  return focusedId(d) === id ? minimizeWindow(d, id) : focusWindow(d, id);
}

export function moveWindow(d: Desktop, id: string, x: number, y: number, area: Size): Desktop {
  const w = d.windows.find((v) => v.id === id);
  if (!w) return d;
  return update(d, id, clampRect({ x, y, w: w.w, h: w.h }, area));
}

export function resizeWindow(d: Desktop, id: string, rect: Rect, min: Size, area: Size): Desktop {
  const w = Math.max(rect.w, Math.min(min.w, area.w));
  const h = Math.max(rect.h, Math.min(min.h, area.h));
  return update(d, id, clampRect({ ...rect, w, h }, area));
}

/** The desktop area changed (window resized, phone rotated): pull every window back inside. */
export function fitAll(d: Desktop, area: Size): Desktop {
  return {
    ...d,
    windows: d.windows.map((w) => ({ ...w, ...clampRect({ ...w, ...fitSize(w, { w: 0, h: 0 }, area) }, area) })),
  };
}

/** Drag/resize from a pointer: the new rectangle for an edge or corner handle. */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function resizeFrom(start: Rect, edge: Edge, dx: number, dy: number, min: Size): Rect {
  let { x, y, w, h } = start;
  if (edge.includes("e")) w = Math.max(min.w, start.w + dx);
  if (edge.includes("s")) h = Math.max(min.h, start.h + dy);
  if (edge.includes("w")) {
    w = Math.max(min.w, start.w - dx);
    x = start.x + start.w - w;
  }
  if (edge.includes("n")) {
    h = Math.max(min.h, start.h - dy);
    y = start.y + start.h - h;
  }
  return { x, y, w, h };
}

function update(d: Desktop, id: string, patch: Partial<WindowState>): Desktop {
  return { ...d, windows: d.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) };
}

/** Remembered window rectangles may be old or edited by hand: keep only sane ones. */
export function parseGeometry(raw: unknown): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, r] of Object.entries(raw as Record<string, unknown>)) {
    const v = r as Partial<Rect> | null;
    const ok = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
    if (/^[a-z0-9-]{1,40}$/.test(id) && v && ok(v.x, -10000, 10000) && ok(v.y, -10000, 10000) && ok(v.w, 100, 10000) && ok(v.h, 80, 10000)) {
      out[id] = { x: v.x!, y: v.y!, w: v.w!, h: v.h! };
    }
  }
  return out;
}
