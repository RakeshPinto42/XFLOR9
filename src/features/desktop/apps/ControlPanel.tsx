"use client";

import { useState, useSyncExternalStore } from "react";
import { soundPrefs, useSoundPrefs } from "@/lib/sound/browser";
import { MAX_NAME, THEMES, WALLPAPERS, cleanName, type ThemeId, type WallpaperId } from "../prefs";
import { controlPanelTab, setDesktopPrefs, useDesktopPrefs, type ControlTab } from "../store";
import { playSystemSound } from "../systemSounds";

/** Control Panel: Display (colours, wallpaper), Sound (volume, system sounds), your name, About. */

type Tab = ControlTab;
const TABS: { id: Tab; label: string }[] = [
  { id: "display", label: "Display" },
  { id: "sound", label: "Sound" },
  { id: "user", label: "Your name" },
  { id: "about", label: "About" },
];

export function ControlPanel() {
  // The start menu or desktop menu may ask for a tab (also when the panel is already open).
  const requested = useSyncExternalStore(controlPanelTab.subscribe, controlPanelTab.get, controlPanelTab.get);
  const [shown, setShown] = useState(requested);
  // A new request switches tab (derived during render, not in an effect).
  if (shown.n !== requested.n) setShown(requested);
  const tab = shown.tab;
  const setTab = (t: Tab) => setShown({ tab: t, n: requested.n });
  return (
    <div className="flex h-full flex-col bg-[var(--xp-face)] p-3 text-[13px] text-black">
      <div role="tablist" aria-label="Settings" className="flex flex-wrap gap-0.5">
        {TABS.map((t) => (
          <button key={t.id} id={`cp-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls="cp-panel" onClick={() => setTab(t.id)} className="xp-tab">
            {t.label}
          </button>
        ))}
      </div>
      <div id="cp-panel" role="tabpanel" aria-labelledby={`cp-tab-${tab}`} className="xp-tabpanel min-h-0 flex-1 overflow-auto p-4">
        {tab === "display" && <Display />}
        {tab === "sound" && <Sound />}
        {tab === "user" && <User />}
        {tab === "about" && <About />}
      </div>
    </div>
  );
}

function Display() {
  const prefs = useDesktopPrefs();
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 font-bold">Wallpaper</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(WALLPAPERS) as WallpaperId[]).map((id) => (
            <label key={id} className="xp-swatch" data-checked={prefs.wallpaper === id || undefined}>
              <input type="radio" name="wallpaper" className="sr-only" checked={prefs.wallpaper === id} onChange={() => setDesktopPrefs({ wallpaper: id })} />
              <span className="xp-wallpaper-thumb" data-wallpaper={id} aria-hidden />
              <span>{WALLPAPERS[id].name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-bold">Colour scheme</legend>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => (
            <label key={id} className="xp-swatch" data-checked={prefs.theme === id || undefined}>
              <input type="radio" name="theme" className="sr-only" checked={prefs.theme === id} onChange={() => setDesktopPrefs({ theme: id })} />
              <span className="xp-theme-thumb" data-theme-preview={id} aria-hidden />
              <span>{THEMES[id]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Sound() {
  const prefs = useDesktopPrefs();
  const sound = useSoundPrefs();
  const volume = Math.round(sound.master * 100);
  return (
    <div className="max-w-md space-y-5">
      <div>
        <label htmlFor="cp-volume" className="mb-1 block font-bold">
          Volume
        </label>
        <div className="flex items-center gap-3">
          <span aria-hidden>Low</span>
          <input
            id="cp-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => soundPrefs.set((p) => ({ ...p, master: Number(e.target.value) / 100 }))}
            aria-valuetext={`${volume}%`}
            className="flex-1"
          />
          <span aria-hidden>High</span>
        </div>
        <p className="mt-1 opacity-80">Sets the radio, Music&apos;s records and the system sounds. YouTube and Internet Archive players have their own volume.</p>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!sound.soundOn} onChange={(e) => soundPrefs.set((p) => ({ ...p, soundOn: !e.target.checked }))} />
        Mute
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={prefs.systemSounds} onChange={(e) => setDesktopPrefs({ systemSounds: e.target.checked })} />
        Play system sounds (start-up, windows, menus)
      </label>
      <button type="button" className="xp-button" onClick={() => playSystemSound("startup")} disabled={!prefs.systemSounds || !sound.soundOn}>
        Play the start-up sound
      </button>
    </div>
  );
}

function User() {
  const prefs = useDesktopPrefs();
  const [name, setName] = useState(prefs.userName);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = cleanName(name);
        setName(clean);
        setDesktopPrefs({ userName: clean });
        setSaved(true);
      }}
    >
      <label htmlFor="cp-name" className="block font-bold">
        Name on the welcome screen
      </label>
      <input
        id="cp-name"
        className="xp-input w-full"
        value={name}
        maxLength={MAX_NAME}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
      />
      <div className="flex items-center gap-3">
        <button type="submit" className="xp-button">
          Save name
        </button>
        <span aria-live="polite">{saved ? "Saved." : ""}</span>
      </div>
      <p className="opacity-80">Stays in this browser. XPLOR9 has no accounts and sends your name nowhere.</p>
    </form>
  );
}

function About() {
  return (
    <div className="max-w-prose space-y-3 leading-relaxed">
      <p className="logo-mark text-3xl">XPLOR9</p>
      <p>A personal entertainment computer from the years 1990 to 2010: radio, television, music, video, games and a reading room.</p>
      <p>
        Everything XPLOR9 remembers (favourites, progress, notes, your desktop) stays in this browser. Videos play in YouTube&apos;s and the Internet
        Archive&apos;s own players; radio streams come straight from each station.
      </p>
      <p>
        The look is inspired by desktop computers of the early 2000s. Every icon, wallpaper and sound here was made for XPLOR9; none is copied from
        any operating system.
      </p>
    </div>
  );
}
