"use client";

import { StationBadge } from "@/features/radio/StationBadge";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import type { PlaybackState } from "@/lib/playback/types";
import { Icon } from "./Icon";

const STATUS_TEXT: Record<Exclude<PlaybackState["status"], "idle" | "error">, string> = {
  loading: "Connecting…",
  buffering: "Buffering…",
  playing: "Live",
  paused: "Paused",
  ended: "Finished",
};

/**
 * Persistent mini-player. Lives in the root layout, so it survives navigation.
 * Hidden until something has been played: no empty or dummy controls.
 */
export function MiniPlayer() {
  const state = usePlayback();
  if (!state.source) return null;

  const engine = getPlaybackEngine();
  const { status, source, error } = state;
  const active = status === "loading" || status === "playing" || status === "buffering";
  const mainAction = status === "error" ? "Retry" : active ? "Pause" : "Play";
  const statusText = status === "error" || status === "idle" ? null : status === "playing" && !source.live ? "Playing" : STATUS_TEXT[status];

  return (
    <>
      {/* Reserves space so the fixed bar never covers the end of the page. */}
      <div aria-hidden className="h-24 sm:h-20" />
      <section
        aria-label="Now playing"
        className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-radio bg-ink text-panel shadow-[0_-6px_20px_rgb(22_32_74/0.25)]"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <StationBadge name={source.title} size="sm" />

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold" title={source.title}>
              {source.title}
            </p>
            <p className="truncate text-sm text-panel/70" aria-live="polite">
              {status === "error" && error ? (
                <span className="text-radio">{error.message}</span>
              ) : statusText ? (
                <>
                  <span className="inline-flex items-center gap-1.5 font-pixel text-xs">
                    {status === "playing" && <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />}
                    {statusText}
                  </span>
                  {source.subtitle && <span className="ml-3 hidden sm:inline">{source.subtitle}</span>}
                </>
              ) : null}
            </p>
          </div>

          <button
            type="button"
            onClick={() => (status === "error" ? engine.play() : engine.toggle())}
            aria-label={`${mainAction} ${source.title}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-radio text-ink hover:bg-panel"
          >
            <Icon name={status === "error" ? "retry" : active ? "pause" : "play"} className="h-6 w-6" />
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => engine.toggleMute()}
              aria-label={state.muted ? "Unmute" : "Mute"}
              aria-pressed={state.muted}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-panel/15"
            >
              <Icon name={state.muted || state.volume === 0 ? "muted" : "volume"} />
            </button>
            {state.volumeControllable && (
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={state.muted ? 0 : Math.round(state.volume * 100)}
                onChange={(e) => engine.setVolume(Number(e.target.value) / 100)}
                aria-label="Volume"
                aria-valuetext={`${state.muted ? 0 : Math.round(state.volume * 100)}%`}
                className="hidden w-24 accent-[var(--color-radio)] sm:block"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => engine.stop()}
            aria-label="Stop and close player"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-panel/15"
          >
            <Icon name="close" />
          </button>
        </div>
      </section>
    </>
  );
}
