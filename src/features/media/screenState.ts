/**
 * What a media page (TV, Music) and its 3D room share (plain TypeScript, no React or three.js):
 *   - the page says whether the set is on and whether the visitor is watching (camera at the
 *     screen) or looking at the room;
 *   - the room reports where the CRT screen is in the window, so the real player can sit
 *     exactly on the glass. While no 3D room is running (Lite, Still, slow devices), `screen`
 *     stays null and the page shows the player in its own frame instead.
 * Only one media page shows at a time, so one shared store is enough.
 */

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenViewState {
  /** The set is switched on (a programme is chosen). */
  on: boolean;
  /** The camera is (or is moving) at the screen. */
  watching: boolean;
  /** A 3D room is running and drawing the TV. */
  room3d: boolean;
  /** Where the screen's glass is in the window (CSS pixels); null without a 3D room. */
  screen: ScreenRect | null;
  /** The camera has arrived at the screen (the player is shown only then, not mid-glide). */
  settled: boolean;
}

const INITIAL: ScreenViewState = { on: false, watching: false, room3d: false, screen: null, settled: false };

let state = INITIAL;
const listeners = new Set<() => void>();

export const screenView = {
  get: () => state,
  server: () => INITIAL,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  set(patch: Partial<ScreenViewState>) {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof ScreenViewState)[]).every((k) => Object.is(next[k], state[k]))) return;
    state = next;
    listeners.forEach((l) => l());
  },
};

/** Screen rectangles closer than half a pixel count as unchanged (no re-render every frame). */
export function sameRect(a: ScreenRect | null, b: ScreenRect | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
