"use client";

import { useSyncExternalStore } from "react";
import { radioOutput } from "@/engine/audio/mixer";
import { setMediaPlaying, soundPrefs } from "@/lib/sound/browser";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/storage/local";
import { PlaybackEngine, clamp, type CrossTabChannel } from "./engine";
import type { PlaybackState } from "./types";

/**
 * Browser wiring for the playback engine: real <audio>, saved volume, a cross-tab channel
 * and Media Session (lock screen / media keys). Created lazily on first use, once per tab.
 * Because it is a module-level singleton (not React state), client-side navigation never
 * recreates it, so audio keeps playing across pages.
 */

let engine: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (engine) return engine;
  engine = new PlaybackEngine({
    createAudio: () => new Audio(),
    isOnline: () => navigator.onLine,
    onConnectivityChange: (handler) => {
      window.addEventListener("online", () => handler(true));
      window.addEventListener("offline", () => handler(false));
    },
    loadPrefs: () => {
      const p = readJson<{ volume?: unknown; muted?: unknown }>(STORAGE_KEYS.playbackPrefs, {});
      return {
        volume: typeof p.volume === "number" ? clamp(p.volume) : 0.8,
        muted: p.muted === true,
      };
    },
    savePrefs: (prefs) => writeJson(STORAGE_KEYS.playbackPrefs, prefs),
    channel: createChannel(),
    onStateChange: syncMediaSession,
  });
  bindMediaSessionActions(engine);
  // Site-wide sound settings: overall × music volume scale the radio; ambience dips while it plays.
  const e = engine;
  const applySound = () => e.setOutput(radioOutput(soundPrefs.get()), false);
  applySound();
  soundPrefs.subscribe(applySound);
  let playing = false;
  e.subscribe(() => {
    const now = e.getState().status === "playing";
    if (now !== playing) setMediaPlaying("audio", (playing = now));
  });
  return engine;
}

const SERVER_STATE: PlaybackState = {
  status: "idle",
  source: null,
  error: null,
  volume: 0.8,
  muted: false,
  volumeControllable: true,
};

const subscribe = (listener: () => void) => getPlaybackEngine().subscribe(listener);
const getSnapshot = () => getPlaybackEngine().getState();
const getServerSnapshot = () => SERVER_STATE;

/** Current playback state; re-renders the component when it changes. */
export function usePlayback(): PlaybackState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function createChannel(): CrossTabChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const bc = new BroadcastChannel("xplor9-playback");
  return {
    post: (message) => bc.postMessage(message),
    onMessage: (handler) => bc.addEventListener("message", (e) => handler(e.data)),
  };
}

function bindMediaSessionActions(e: PlaybackEngine) {
  if (!("mediaSession" in navigator)) return;
  const set = (action: MediaSessionAction, handler: () => void) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Unsupported action in this browser; skip it.
    }
  };
  set("play", () => e.play());
  set("pause", () => e.pause());
  set("stop", () => e.stop());
}

let lastSourceId: string | null = null;
function syncMediaSession(state: PlaybackState) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  if (state.source?.id !== lastSourceId) {
    lastSourceId = state.source?.id ?? null;
    ms.metadata = state.source
      ? new MediaMetadata({ title: state.source.title, artist: state.source.subtitle ?? "", album: "XPLOR9 Radio" })
      : null;
  }
  ms.playbackState =
    state.status === "playing" || state.status === "buffering" || state.status === "loading"
      ? "playing"
      : state.source
        ? "paused"
        : "none";
}
