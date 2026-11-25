import { describe, expect, it } from "vitest";
import {
  EMPTY_DESKTOP,
  KEEP_VISIBLE,
  clampRect,
  closeWindow,
  fitAll,
  focusWindow,
  focusedId,
  minimizeWindow,
  moveWindow,
  openWindow,
  parseGeometry,
  resizeFrom,
  resizeWindow,
  taskbarClick,
  toggleMaximize,
} from "./windows";

const area = { w: 1280, h: 720 };
const open = (d = EMPTY_DESKTOP, id = "radio") => openWindow(d, { id, size: { w: 600, h: 400 }, min: { w: 300, h: 200 }, area });

describe("window manager", () => {
  it("opens a window inside the area and focuses it", () => {
    const d = open();
    expect(d.windows).toHaveLength(1);
    const w = d.windows[0];
    expect(w.x).toBeGreaterThanOrEqual(0);
    expect(w.x + w.w).toBeLessThanOrEqual(area.w);
    expect(w.y + w.h).toBeLessThanOrEqual(area.h);
    expect(focusedId(d)).toBe("radio");
  });

  it("keeps one window per app: opening again brings it forward and restores it", () => {
    let d = open(open(), "tv");
    d = minimizeWindow(d, "radio");
    d = open(d, "radio");
    expect(d.windows).toHaveLength(2);
    expect(d.windows.find((w) => w.id === "radio")!.minimized).toBe(false);
    expect(focusedId(d)).toBe("radio");
  });

  it("cascades new windows so they don't cover each other exactly", () => {
    const d = open(open(), "tv");
    const [a, b] = d.windows;
    expect(b.x).not.toBe(a.x);
    expect(b.y).not.toBe(a.y);
  });

  it("shrinks a window that is bigger than a small screen", () => {
    const d = openWindow(EMPTY_DESKTOP, { id: "tv", size: { w: 900, h: 700 }, min: { w: 300, h: 200 }, area: { w: 390, h: 600 } });
    expect(d.windows[0].w).toBe(390);
    expect(d.windows[0].h).toBe(600);
  });

  it("focus raises z-order; minimise hands focus to the next window", () => {
    let d = open(open(), "tv");
    expect(focusedId(d)).toBe("tv");
    d = focusWindow(d, "radio");
    expect(focusedId(d)).toBe("radio");
    d = minimizeWindow(d, "radio");
    expect(focusedId(d)).toBe("tv");
    d = minimizeWindow(d, "tv");
    expect(focusedId(d)).toBeNull();
  });

  it("taskbar button minimises the focused window and restores others", () => {
    let d = open(open(), "tv");
    d = taskbarClick(d, "tv");
    expect(d.windows.find((w) => w.id === "tv")!.minimized).toBe(true);
    d = taskbarClick(d, "tv");
    expect(focusedId(d)).toBe("tv");
    d = taskbarClick(d, "radio");
    expect(focusedId(d)).toBe("radio");
  });

  it("maximise toggles and focuses; close removes", () => {
    let d = open(open(), "tv");
    d = toggleMaximize(d, "radio");
    expect(d.windows.find((w) => w.id === "radio")!.maximized).toBe(true);
    expect(focusedId(d)).toBe("radio");
    d = toggleMaximize(d, "radio");
    expect(d.windows.find((w) => w.id === "radio")!.maximized).toBe(false);
    d = closeWindow(d, "radio");
    expect(d.windows.map((w) => w.id)).toEqual(["tv"]);
  });

  it("never lets a title bar leave the desktop", () => {
    let d = open();
    d = moveWindow(d, "radio", -5000, -300, area);
    const w = d.windows[0];
    expect(w.x + w.w).toBe(KEEP_VISIBLE);
    expect(w.y).toBe(0);
    d = moveWindow(d, "radio", 99999, 99999, area);
    expect(d.windows[0].x).toBe(area.w - KEEP_VISIBLE);
    expect(d.windows[0].y).toBeLessThan(area.h);
  });

  it("resizing respects the minimum size from every edge", () => {
    const start = { x: 100, y: 100, w: 400, h: 300 };
    expect(resizeFrom(start, "se", 50, 20, { w: 300, h: 200 })).toEqual({ x: 100, y: 100, w: 450, h: 320 });
    expect(resizeFrom(start, "nw", 300, 300, { w: 300, h: 200 })).toEqual({ x: 200, y: 200, w: 300, h: 200 });
    let d = open();
    d = resizeWindow(d, "radio", { x: 10, y: 10, w: 50, h: 50 }, { w: 300, h: 200 }, area);
    expect(d.windows[0].w).toBe(300);
    expect(d.windows[0].h).toBe(200);
  });

  it("pulls windows back in when the screen gets smaller", () => {
    let d = open();
    d = moveWindow(d, "radio", 1100, 600, area);
    d = fitAll(d, { w: 390, h: 700 });
    const w = d.windows[0];
    expect(w.w).toBeLessThanOrEqual(390);
    expect(w.x).toBeLessThanOrEqual(390 - KEEP_VISIBLE);
  });

  it("reopens at the remembered place, clamped to the current area", () => {
    const d = openWindow(EMPTY_DESKTOP, { id: "tv", size: { w: 600, h: 400 }, min: { w: 300, h: 200 }, area, remembered: { x: 5000, y: 40, w: 700, h: 500 } });
    expect(d.windows[0]).toMatchObject({ x: area.w - KEEP_VISIBLE, y: 40, w: 700, h: 500 });
  });

  it("clampRect rounds to whole pixels", () => {
    expect(clampRect({ x: 10.4, y: 10.6, w: 300.2, h: 200.7 }, area)).toEqual({ x: 10, y: 11, w: 300, h: 201 });
  });

  it("ignores corrupted remembered geometry", () => {
    expect(parseGeometry(null)).toEqual({});
    expect(parseGeometry({ radio: { x: 1, y: 2, w: 300, h: 200 }, bad: { x: "1" }, "../x": { x: 1, y: 1, w: 300, h: 300 }, tv: { x: 1, y: 1, w: 5, h: 5 } })).toEqual({
      radio: { x: 1, y: 2, w: 300, h: 200 },
    });
  });
});
