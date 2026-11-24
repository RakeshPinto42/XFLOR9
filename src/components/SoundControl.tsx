"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SoundPrefs } from "@/engine/audio/mixer";
import { getMixer, soundPrefs, useSoundPrefs, useSoundRunning, useSoundSupported } from "@/lib/sound/browser";
import { Icon } from "./Icon";

/**
 * Site-wide sound: a switch for the world's sounds (off until the visitor turns it on) and a
 * small panel of volumes. The radio keeps its own play and mute buttons and follows the overall
 * and music volumes.
 */
export function SoundControl() {
  const prefs = useSoundPrefs();
  const running = useSoundRunning();
  const supported = useSoundSupported();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Install the gesture listeners on every page, so remembered sound starts on the first click.
  useEffect(() => {
    getMixer();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const toggleSound = () => {
    const next = !soundPrefs.get().soundOn;
    soundPrefs.set((p) => ({ ...p, soundOn: next }));
    if (next) getMixer().unlock(); // this click is the gesture browsers require
  };
  const set = <K extends keyof SoundPrefs>(key: K, value: SoundPrefs[K]) => soundPrefs.set((p) => ({ ...p, [key]: value }));

  return (
    <div ref={wrap} className="relative ml-auto flex items-center gap-1 sm:ml-0" data-testid="sound-control">
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={prefs.soundOn}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.95rem] font-semibold hover:bg-ink/10 aria-pressed:bg-ink aria-pressed:text-panel"
      >
        <Icon name={prefs.soundOn ? "volume" : "muted"} />
        {prefs.soundOn ? "Sound on" : "Sound off"}
      </button>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Sound settings"
        className="rounded-full p-2 hover:bg-ink/10"
      >
        <Icon name="sliders" />
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Sound settings"
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border-2 border-ink bg-panel p-4 text-ink shadow-lg"
        >
          <Slider label="Overall volume" value={prefs.master} onChange={(v) => set("master", v)} />
          <Slider label="Rain, thunder and surroundings" value={prefs.ambience} onChange={(v) => set("ambience", v)} />
          <Slider label="Music and radio" value={prefs.music} onChange={(v) => set("music", v)} />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prefs.reduceSudden} onChange={(e) => set("reduceSudden", e.target.checked)} className="h-4 w-4 accent-current" />
            Reduce sudden sounds (softer thunder)
          </label>
          <p className="mt-3 text-xs text-ink-soft" aria-live="polite" data-testid="sound-status">
            {!prefs.soundOn
              ? "World sounds are off. The radio has its own play and mute buttons."
              : !supported
                ? "This browser can't play the world's sounds. The radio still works."
                : running
                ? "World sounds are on."
                : "World sounds start when you click or press a key."}
          </p>
        </section>
      )}
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const percent = Math.round(value * 100);
  return (
    <div className="mt-2 first:mt-0">
      <label htmlFor={id} className="flex justify-between text-sm font-semibold">
        <span>{label}</span>
        <span aria-hidden className="font-normal text-ink-soft">{percent}%</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-1 w-full accent-current"
      />
    </div>
  );
}
