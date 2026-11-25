"use client";

import { useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";

/** Notepad: one plain-text page, saved in this browser as you type. */

export const MAX_NOTE = 100_000;
interface NoteState {
  text: string;
  wrap: boolean;
}
const parseNote = (raw: unknown): NoteState => {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { text: typeof r.text === "string" ? r.text.slice(0, MAX_NOTE) : "", wrap: r.wrap !== false };
};
const note = createLocalStore<NoteState>(STORAGE_KEYS.notepad, { text: "", wrap: true }, parseNote);

export function Notepad() {
  const saved = useLocalStore(note);
  const [text, setText] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const value = text ?? saved.text;
  const area = useRef<HTMLTextAreaElement>(null);

  // Save shortly after typing stops (not on every key).
  useEffect(() => {
    if (text === null) return;
    const t = window.setTimeout(() => {
      note.set((n) => ({ ...n, text }));
      setSaveFailed(note.get().text !== text || localStorageFailed());
    }, 400);
    return () => window.clearTimeout(t);
  }, [text]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "note.txt";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--xp-face)] text-[13px]">
      <div className="xp-toolbar flex flex-wrap items-center gap-1 px-1 py-1" role="toolbar" aria-label="Notepad">
        {confirmNew ? (
          <span role="alert" className="flex items-center gap-1">
            Clear this note?
            <button
              type="button"
              className="xp-button"
              onClick={() => {
                setText("");
                setConfirmNew(false);
                area.current?.focus();
              }}
            >
              Clear
            </button>
            <button type="button" className="xp-button" onClick={() => setConfirmNew(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="xp-button" onClick={() => (value ? setConfirmNew(true) : area.current?.focus())}>
            New
          </button>
        )}
        <button type="button" className="xp-button" onClick={download} disabled={!value}>
          Save as .txt
        </button>
        <label className="ml-2 flex items-center gap-1">
          <input type="checkbox" checked={saved.wrap} onChange={(e) => note.set((n) => ({ ...n, wrap: e.target.checked }))} />
          Word wrap
        </label>
      </div>
      <label htmlFor="notepad-text" className="sr-only">
        Note text
      </label>
      <textarea
        id="notepad-text"
        ref={area}
        value={value}
        maxLength={MAX_NOTE}
        onChange={(e) => setText(e.target.value)}
        wrap={saved.wrap ? "soft" : "off"}
        spellCheck
        className={`min-h-0 flex-1 resize-none border-0 bg-white p-2 font-mono text-[14px] leading-snug text-black outline-none ${saved.wrap ? "" : "whitespace-pre overflow-x-auto"}`}
      />
      <div className="xp-statusbar flex justify-between px-2 py-0.5" aria-live="polite">
        <span>{saveFailed ? "Couldn't save: this browser is blocking storage." : "Saved in this browser"}</span>
        <span>{value.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}

function localStorageFailed(): boolean {
  try {
    const k = "xplor9.__probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return false;
  } catch {
    return true;
  }
}
