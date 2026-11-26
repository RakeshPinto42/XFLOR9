"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { clock } from "@/features/music/playlist";
import type { PlayerTime } from "./EmbedPlayer";
import "./mediaplayer.css";

/**
 * The transport bar under a media player's screen (TV, Video): previous / play-pause / stop /
 * next, a position bar with time, volume and full screen. Controls that the current player
 * can't honour (the Internet Archive's player has no remote control) are disabled, not faked.
 */
export function MediaTransport({
  playing,
  controllable,
  time,
  onPlayPause,
  onStop,
  stopLabel = "Stop",
  onPrev,
  onNext,
  prevLabel = "Previous",
  nextLabel = "Next",
  onSeek,
  volume,
  onVolume,
  onFullscreen,
  children,
}: {
  playing: boolean;
  /** The player accepts play/pause/seek/volume (YouTube yes, Internet Archive no). */
  controllable: boolean;
  time: PlayerTime | null;
  onPlayPause: () => void;
  onStop: () => void;
  stopLabel?: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  onSeek: (seconds: number) => void;
  volume: number;
  onVolume: (v: number) => void;
  onFullscreen?: () => void;
  /** Extra buttons (favourite, open on the provider's site). */
  children?: ReactNode;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const duration = controllable ? (time?.duration ?? null) : null;
  const current = time?.current ?? 0;
  const commit = () => {
    if (scrub !== null) onSeek(scrub);
    setScrub(null);
  };
  return (
    <div className="mx-transport" role="group" aria-label="Player controls">
      <div className="mx-seek">
        <span className="mx-time">{clock(controllable ? (scrub ?? current) : null)}</span>
        <input
          type="range"
          aria-label="Position"
          min={0}
          max={duration ?? 1}
          step={1}
          value={duration === null ? 0 : (scrub ?? Math.min(current, duration))}
          disabled={duration === null}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          aria-valuetext={`${clock(scrub ?? current)} of ${clock(duration)}`}
        />
        <span className="mx-time">{clock(duration)}</span>
      </div>
      <div className="mx-buttons">
        {onPrev && (
          <button type="button" className="mx-key" onClick={onPrev} aria-label={prevLabel} title={prevLabel}>
            <Icon name="prev" className="h-4 w-4" />
          </button>
        )}
        <button type="button" className="mx-key mx-key--main" onClick={onPlayPause} disabled={!controllable} aria-label={playing ? "Pause" : "Play"} title={controllable ? undefined : "This player can only be stopped"}>
          <Icon name={playing ? "pause" : "play"} className="h-5 w-5" />
        </button>
        <button type="button" className="mx-key" onClick={onStop} aria-label={stopLabel} title={stopLabel}>
          <Icon name="stop" className="h-4 w-4" />
        </button>
        {onNext && (
          <button type="button" className="mx-key" onClick={onNext} aria-label={nextLabel} title={nextLabel}>
            <Icon name="next" className="h-4 w-4" />
          </button>
        )}
        <span className="mx-spacer" />
        {children}
        <label className="mx-volume" title={controllable ? undefined : "Use the player's own volume"}>
          <Icon name={volume === 0 ? "muted" : "volume"} className="h-4 w-4" />
          <span className="sr-only">Volume</span>
          <input type="range" min={0} max={100} step={5} value={volume} disabled={!controllable} onChange={(e) => onVolume(Number(e.target.value))} aria-valuetext={`${volume}%`} />
        </label>
        {onFullscreen && (
          <button type="button" className="mx-key" onClick={onFullscreen} aria-label="Fullscreen" title="Full screen">
            <Icon name="expand" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Ask the browser to show an element full screen (ignored where unsupported). */
export function fullscreen(el: HTMLElement | null) {
  if (el && document.fullscreenEnabled) void el.requestFullscreen?.().catch(() => {});
}

/** Bring the player into view after choosing something further down a list. */
export function revealPlayer(el: HTMLElement | null) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}
