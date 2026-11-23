"use client";

import type { RefObject } from "react";
import { useLocalStore } from "@/lib/storage/store";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP, THEMES, clampFontScale, type ReaderTheme } from "./settings";
import { readerSettings } from "./settingsStore";

/** Text size and theme panel (native modal dialog), shared by the catalogue and imported-book readers. */
export function SettingsDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const settings = useLocalStore(readerSettings);
  const theme = THEMES[settings.theme];
  const setTheme = (t: ReaderTheme) => readerSettings.set((s) => ({ ...s, theme: t }));
  const setScale = (v: number) => readerSettings.set((s) => ({ ...s, fontScale: clampFontScale(v) }));
  const settingsRef = dialogRef;
  return (
  <dialog
    ref={settingsRef}
    aria-label="Text and theme settings"
    className="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-2xl p-5 backdrop:bg-black/30 sm:mb-auto sm:rounded-2xl"
    style={{ background: theme.bg, color: theme.text }}
    onClick={(e) => e.target === e.currentTarget && settingsRef.current?.close()}
  >
    <div className="flex items-center justify-between">
      <h2 className="font-semibold">Text and theme</h2>
      <button type="button" onClick={() => settingsRef.current?.close()} className="px-2 py-1 text-sm font-semibold">
        Close
      </button>
    </div>
    <div className="mt-4 flex items-center gap-3">
      <span className="w-24 text-sm">Text size</span>
      <button
        type="button"
        onClick={() => setScale(settings.fontScale - FONT_SCALE_STEP)}
        disabled={settings.fontScale <= FONT_SCALE_MIN}
        aria-label="Smaller text"
        className="h-10 w-10 rounded-full border-2 text-sm font-bold disabled:opacity-40"
        style={{ borderColor: theme.muted }}
      >
        A−
      </button>
      <output className="w-14 text-center tabular-nums" aria-live="polite">
        {settings.fontScale}%
      </output>
      <button
        type="button"
        onClick={() => setScale(settings.fontScale + FONT_SCALE_STEP)}
        disabled={settings.fontScale >= FONT_SCALE_MAX}
        aria-label="Larger text"
        className="h-10 w-10 rounded-full border-2 text-lg font-bold disabled:opacity-40"
        style={{ borderColor: theme.muted }}
      >
        A+
      </button>
    </div>
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(THEMES) as ReaderTheme[]).map((t) => (
          <label
            key={t}
            className="cursor-pointer rounded-xl border-2 px-2 py-3 text-center text-sm font-semibold has-[:checked]:ring-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
            style={{
              background: THEMES[t].bg,
              color: THEMES[t].text,
              borderColor: settings.theme === t ? THEMES[t].link : `${THEMES[t].muted}55`,
            }}
          >
            <input type="radio" name="reader-theme" checked={settings.theme === t} onChange={() => setTheme(t)} className="sr-only" />
            {THEMES[t].label}
          </label>
        ))}
      </div>
    </fieldset>
  </dialog>
  );
}
