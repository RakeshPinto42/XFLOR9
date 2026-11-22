"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS, writeJson } from "@/lib/storage/local";

export const REPLAY_INTRO_EVENT = "xplor9:replay-intro";

const BAR_COLOURS = ["bg-radio", "bg-tv", "bg-music", "bg-games", "bg-reading"];

/**
 * Logo-led CRT intro. The animation itself is CSS (see globals.css); this component
 * only handles Skip / Escape / replay and remembers that the visitor has seen it.
 * Returning visitors never see it: an inline script in the root layout hides it before paint.
 * No audio yet, so there is no mute control and no captions to show.
 */
export function CrtIntro() {
  const [mode, setMode] = useState<"auto" | "replay" | "done">("auto");
  const skipRef = useRef<HTMLButtonElement>(null);
  // Where keyboard focus was before a replay, so we can hand it back afterwards.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const finish = useCallback(() => {
    writeJson(STORAGE_KEYS.introSeen, true);
    document.documentElement.dataset.introSeen = "true";
    setMode("done");
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, []);

  useEffect(() => {
    const replay = () => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setMode("replay");
    };
    window.addEventListener(REPLAY_INTRO_EVENT, replay);
    return () => window.removeEventListener(REPLAY_INTRO_EVENT, replay);
  }, []);

  useEffect(() => {
    if (mode === "done") return;
    // Only grab focus if the intro is actually visible (not hidden for returning visitors).
    if (skipRef.current?.offsetParent !== null) skipRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, finish]);

  if (mode === "done") return null;

  return (
    <div
      className={`crt-intro ${mode === "replay" ? "is-replay" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="XPLOR9 intro"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "intro-out") finish();
      }}
    >
      <div className="crt-intro__tube crt-screen">
        <div className="crt-intro__static static-noise" />
        <div className="crt-intro__content">
          <p className="crt-intro__logo logo-mark logo-mark--on-screen">XPLOR9</p>
          <p className="crt-intro__line">Your childhood. Reconnected.</p>
          <div className="crt-intro__bars" aria-hidden>
            {BAR_COLOURS.map((c) => (
              <span key={c} className={c} />
            ))}
          </div>
        </div>
      </div>
      <button
        ref={skipRef}
        type="button"
        onClick={finish}
        className="absolute bottom-6 right-6 rounded-full border-2 border-panel/70 px-5 py-2 font-semibold text-panel hover:bg-panel hover:text-ink"
      >
        Skip intro
      </button>
    </div>
  );
}

export function ReplayIntroButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(REPLAY_INTRO_EVENT))}
    >
      Replay intro
    </button>
  );
}
