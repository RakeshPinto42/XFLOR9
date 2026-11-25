"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { soundPrefs, useSoundPrefs } from "@/lib/sound/browser";
import { APP_BY_ID, type AppId } from "./apps";
import { DesktopIcon } from "./icons";
import { useDesktop, wm } from "./store";
import { playSystemSound } from "./systemSounds";
import { focusedId } from "./windows";

/** The taskbar: start button, one button per open window, and the tray (now playing, volume, clock). */
export function Taskbar({ startOpen, onStart }: { startOpen: boolean; onStart: () => void }) {
  const desktop = useDesktop();
  const focused = focusedId(desktop);
  return (
    <div className="xp-taskbar" role="toolbar" aria-label="Taskbar">
      <button type="button" className="xp-start" aria-label="Start menu" aria-expanded={startOpen} aria-haspopup="menu" aria-controls="start-menu" onClick={onStart}>
        <DesktopIcon name="start" size={22} />
        <span>start</span>
      </button>
      <ul className="xp-task-list" aria-label="Open windows">
        {desktop.windows.map((w) => {
          const app = APP_BY_ID[w.id as AppId];
          return (
            <li key={w.id} className="min-w-0">
              <button
                type="button"
                className="xp-task"
                aria-pressed={focused === w.id}
                data-minimized={w.minimized || undefined}
                onClick={() => {
                  if (focused === w.id) playSystemSound("minimize");
                  else if (w.minimized) playSystemSound("restore");
                  wm.taskbar(app.id);
                }}
              >
                <DesktopIcon name={app.id} size={16} className="shrink-0" />
                <span className="xp-task-label truncate">{app.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="xp-tray">
        <NowPlaying />
        <Volume />
        <Clock />
      </div>
    </div>
  );
}

/** A tray button with a pop-up panel above it; closes on Escape or a click elsewhere. */
function TrayPopup({ label, icon, children, testId }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode; testId: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" className="xp-tray-button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid={testId}>
        {icon}
      </button>
      {open && (
        <div className="xp-popup" role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const ACTIVE = new Set(["loading", "playing", "buffering"]);

/** The shared audio player (radio stations, Music's records), shown only while it has something. */
function NowPlaying() {
  const state = usePlayback();
  if (!state.source) return null;
  const engine = getPlaybackEngine();
  const active = ACTIVE.has(state.status);
  const status =
    state.status === "error"
      ? (state.error?.message ?? "Couldn't play")
      : state.status === "loading"
        ? "Connecting…"
        : state.status === "buffering"
          ? "Buffering…"
          : state.status === "playing"
            ? state.source.live
              ? "Live"
              : "Playing"
            : state.status === "paused"
              ? "Paused"
              : "Stopped";
  return (
    <TrayPopup label={`Now playing: ${state.source.title}`} icon={<DesktopIcon name="note" size={16} className={active ? "xp-pulse" : ""} />} testId="tray-now-playing">
      {(close) => (
        <div className="w-64 space-y-2">
          <p className="truncate font-bold" title={state.source!.title}>
            {state.source!.title}
          </p>
          <p className="truncate" aria-live="polite">
            {status}
            {state.source!.subtitle ? ` · ${state.source!.subtitle}` : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="xp-button" onClick={() => (state.status === "error" ? engine.play() : engine.toggle())}>
              {state.status === "error" ? "Retry" : active ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="xp-button"
              onClick={() => {
                engine.stop();
                close();
              }}
            >
              Stop
            </button>
            <button
              type="button"
              className="xp-button"
              onClick={() => {
                wm.open(state.source!.id.startsWith("music:") ? "music" : "radio");
                close();
              }}
            >
              Show player
            </button>
          </div>
        </div>
      )}
    </TrayPopup>
  );
}

function Volume() {
  const sound = useSoundPrefs();
  const muted = !sound.soundOn;
  const volume = Math.round(sound.master * 100);
  return (
    <TrayPopup label={muted ? "Volume (muted)" : `Volume ${volume}%`} icon={<DesktopIcon name={muted || volume === 0 ? "muted" : "volume"} size={16} />} testId="tray-volume">
      {() => (
        <div className="flex w-28 flex-col items-center gap-2">
          <label htmlFor="tray-volume-range" className="font-bold">
            Volume
          </label>
          <input
            id="tray-volume-range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => soundPrefs.set((p) => ({ ...p, master: Number(e.target.value) / 100 }))}
            aria-valuetext={`${volume}%`}
            className="xp-vertical-range"
          />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={muted} onChange={(e) => soundPrefs.set((p) => ({ ...p, soundOn: !e.target.checked }))} />
            Mute
          </label>
        </div>
      )}
    </TrayPopup>
  );
}

// The clock ticks once a minute (aligned to the minute), shared by every subscriber.
const clockListeners = new Set<() => void>();
let clockTimer: number | null = null;
let clockNow = 0;
function subscribeClock(l: () => void) {
  clockListeners.add(l);
  if (clockTimer === null) {
    clockNow = Date.now();
    const tick = () => {
      clockNow = Date.now();
      clockListeners.forEach((f) => f());
      clockTimer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    clockTimer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
  }
  return () => {
    clockListeners.delete(l);
    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearTimeout(clockTimer);
      clockTimer = null;
    }
  };
}

function Clock() {
  const now = useSyncExternalStore(
    subscribeClock,
    () => clockNow || (clockNow = Date.now()),
    () => 0,
  );
  if (!now) return <span className="xp-clock" />;
  const d = new Date(now);
  return (
    <time className="xp-clock" dateTime={d.toISOString()} title={d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}>
      {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
