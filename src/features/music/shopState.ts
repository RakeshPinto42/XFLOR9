/**
 * What the Music page tells the 3D cassette shop (plain TypeScript, no React or three.js): which
 * tapes stand on the counter, which one is in the deck, and whether it is playing (the deck's
 * reels turn only then). The shop never changes it.
 */

export interface ShopTape {
  id: string;
  shell: string;
  label: string;
}

export interface ShopState {
  tapes: ShopTape[];
  /** The tape in the deck, or null (deck empty). */
  inDeck: string | null;
  /** Music is actually playing (reels turn). */
  playing: boolean;
}

const INITIAL: ShopState = { tapes: [], inDeck: null, playing: false };
let state = INITIAL;
const listeners = new Set<() => void>();

export const shopState = {
  get: () => state,
  server: () => INITIAL,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  set(patch: Partial<ShopState>) {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof ShopState)[]).every((k) => Object.is(next[k], state[k]))) return;
    state = next;
    listeners.forEach((l) => l());
  },
};
