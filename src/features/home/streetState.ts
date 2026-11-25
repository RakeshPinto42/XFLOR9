/**
 * What the homepage and its 3D street share (plain TypeScript, no React or three.js):
 *   - the street reports where each module's signboard is in the window, so the page can lay a
 *     pointer target exactly over it (the canvas itself never takes clicks);
 *   - the page says which sign is pointed at or focused (it lights up) and which one the visitor
 *     chose (the camera walks towards it before the page changes).
 * Without a running 3D street (Lite, Still, no WebGL) `signs` stays empty and the page's own
 * list of links is the way in.
 */

import type { ModuleId } from "@/lib/modules";
import { sameRect, type ScreenRect } from "@/features/media/screenState";

export interface StreetState {
  signs: Partial<Record<ModuleId, ScreenRect | null>>;
  hovered: ModuleId | null;
  going: ModuleId | null;
}

const INITIAL: StreetState = { signs: {}, hovered: null, going: null };
let state = INITIAL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const streetView = {
  get: () => state,
  server: () => INITIAL,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  setSign(id: ModuleId, rect: ScreenRect | null) {
    if (sameRect(state.signs[id] ?? null, rect)) return;
    state = { ...state, signs: { ...state.signs, [id]: rect } };
    emit();
  },
  hover(id: ModuleId | null) {
    if (state.hovered === id) return;
    state = { ...state, hovered: id };
    emit();
  },
  go(id: ModuleId | null) {
    if (state.going === id) return;
    state = { ...state, going: id };
    emit();
  },
  /** The street left the screen: forget where its signs were. */
  reset() {
    state = { ...INITIAL };
    emit();
  },
};
