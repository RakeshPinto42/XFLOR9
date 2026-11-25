"use client";

import { useEffect, useRef } from "react";
import { getPlaybackEngine } from "./browser";

/**
 * One sound at a time across desktop windows. Each embedded player (TV, Music videos, Video)
 * claims the speakers when it starts playing; every other player pauses. The shared audio
 * player (radio, Music's records) counts as the owner "audio" whenever it starts.
 */

type Owner = string;
const listeners = new Set<(owner: Owner) => void>();
let engineHooked = false;

export function claimMedia(owner: Owner) {
  listeners.forEach((l) => l(owner));
}

function hookEngine() {
  if (engineHooked) return;
  engineHooked = true;
  const engine = getPlaybackEngine();
  let was = engine.getState().status;
  engine.subscribe(() => {
    const s = engine.getState().status;
    if ((s === "loading" || s === "playing") && was !== "loading" && was !== "playing") claimMedia("audio");
    was = s;
  });
}

/**
 * While `playing`, this player owns the speakers: the shared audio player is paused, and `pause`
 * is called if anything else starts.
 */
export function useExclusiveMedia(owner: Owner, playing: boolean, pause: () => void) {
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  });
  useEffect(() => {
    hookEngine();
    const onClaim = (by: Owner) => {
      if (by !== owner) pauseRef.current();
    };
    listeners.add(onClaim);
    return () => void listeners.delete(onClaim);
  }, [owner]);
  useEffect(() => {
    if (!playing) return;
    claimMedia(owner);
    const radio = getPlaybackEngine();
    if (owner !== "audio" && ["playing", "loading", "buffering"].includes(radio.getState().status)) radio.pause();
  }, [owner, playing]);
}
