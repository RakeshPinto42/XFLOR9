"use client";

import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";
import { APP_BY_ID, isAppId, type AppId } from "./apps";
import { DEFAULT_DESKTOP_PREFS, parseDesktopPrefs, type DesktopPrefs } from "./prefs";
import {
  EMPTY_DESKTOP,
  closeWindow,
  fitAll,
  focusWindow,
  minimizeWindow,
  moveWindow,
  openWindow,
  parseGeometry,
  parseSession,
  sessionSnapshot,
  resizeWindow,
  taskbarClick,
  toggleMaximize,
  type Desktop,
  type Rect,
  type SavedWindow,
  type Size,
} from "./windows";

/**
 * The desktop's live state for React: which windows are open (this visit only) and where each
 * app's window was last placed (remembered). One store per tab; windows are plain data, the
 * components render them.
 */

export const desktopPrefs = createLocalStore<DesktopPrefs>(STORAGE_KEYS.desktopPrefs, DEFAULT_DESKTOP_PREFS, parseDesktopPrefs);
export const useDesktopPrefs = () => useLocalStore(desktopPrefs);
export const setDesktopPrefs = (patch: Partial<DesktopPrefs>) => desktopPrefs.set((p) => ({ ...p, ...patch }));

const geometry = createLocalStore<Record<string, Rect>>(STORAGE_KEYS.desktopGeometry, {}, parseGeometry);

let state: Desktop = EMPTY_DESKTOP;
let area: Size = { w: 1024, h: 700 };
const listeners = new Set<() => void>();
const set = (next: Desktop) => {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
};

export const wm = {
  get: () => state,
  server: () => EMPTY_DESKTOP,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  /** The desktop area (window minus taskbar) changed size. */
  setArea(size: Size) {
    area = size;
    set(fitAll(state, size));
  },
  area: () => area,
  isOpen: (id: AppId) => state.windows.some((w) => w.id === id),
  open(id: AppId) {
    const app = APP_BY_ID[id];
    set(openWindow(state, { id, size: app.size, min: app.min, area, remembered: geometry.get()[id] ?? null }));
  },
  close(id: AppId) {
    remember(id);
    set(closeWindow(state, id));
  },
  closeAll() {
    for (const w of state.windows) remember(w.id as AppId);
    set(EMPTY_DESKTOP);
  },
  focus: (id: AppId) => set(focusWindow(state, id)),
  minimize: (id: AppId) => set(minimizeWindow(state, id)),
  toggleMaximize: (id: AppId) => set(toggleMaximize(state, id)),
  taskbar: (id: AppId) => set(taskbarClick(state, id)),
  move: (id: AppId, x: number, y: number) => set(moveWindow(state, id, x, y, area)),
  resize: (id: AppId, rect: Rect) => set(resizeWindow(state, id, rect, APP_BY_ID[id].min, area)),
  /** A drag or resize ended: remember the place for next time. */
  commit: (id: AppId) => remember(id),
};

function remember(id: AppId) {
  const w = state.windows.find((v) => v.id === id);
  if (!w || w.maximized) return;
  geometry.set((g) => ({ ...g, [id]: { x: w.x, y: w.y, w: w.w, h: w.h } }));
}

export function useDesktop(): Desktop {
  return useSyncExternalStore(wm.subscribe, wm.get, wm.server);
}

/** Which Control Panel tab to show when it opens (the start menu and desktop menu ask for one). */
export type ControlTab = "display" | "sound" | "user" | "about";
let controlTab: { tab: ControlTab; n: number } = { tab: "display", n: 0 };
const tabListeners = new Set<() => void>();
export const controlPanelTab = {
  get: () => controlTab,
  subscribe(l: () => void) {
    tabListeners.add(l);
    return () => void tabListeners.delete(l);
  },
};
export function openControlPanel(tab: ControlTab) {
  controlTab = { tab, n: controlTab.n + 1 };
  tabListeners.forEach((l) => l());
  wm.open("control");
}

// ---------- session restore: the open windows come back after a reload (this tab's session) ----------
const SESSION_WINDOWS = "xplor9.session.windows";

/** Reopen what was open before the reload, in the same order and state. Runs once per page. */
export function restoreSession() {
  if (state.windows.length) return;
  let saved: SavedWindow[] = [];
  try {
    saved = parseSession(JSON.parse(window.sessionStorage.getItem(SESSION_WINDOWS) ?? "null"), isAppId);
  } catch {
    saved = [];
  }
  for (const w of saved) {
    wm.open(w.id as AppId);
    if (w.maximized) wm.toggleMaximize(w.id as AppId);
  }
  for (const w of saved) if (w.minimized) wm.minimize(w.id as AppId);
}

/** Keeps the saved session up to date; returns the unsubscribe. */
export function persistSession() {
  return wm.subscribe(() => {
    try {
      window.sessionStorage.setItem(SESSION_WINDOWS, JSON.stringify(sessionSnapshot(state)));
    } catch {
      // Storage blocked: a reload just starts with an empty desktop.
    }
  });
}
