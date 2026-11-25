"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Switching the computer on: a short memory check (first visit only), the XPLOR9 logo with a
 * loading bar, then the welcome screen. Any key or click skips ahead. With reduced motion the
 * steps are shown without animation and shorter.
 */

const POST_LINES = [
  "XPLOR9 BIOS v9.0  (c) 1999-2010",
  "CPU: Pentium-class processor at 450 MHz",
  "Memory test: 131072K OK",
  "Detecting drives ... CD-ROM, Floppy A:",
  "Sound card: 16-bit stereo, IRQ 5",
  "Modem: 56K, dial-up ready",
  "Starting XPLOR9 ...",
];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BootSequence({ full, onDone }: { full: boolean; onDone: () => void }) {
  const [stage, setStage] = useState<"post" | "logo">(full ? "post" : "logo");
  const [lines, setLines] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const quick = reducedMotion();
    const timers: number[] = [];
    if (stage === "post") {
      POST_LINES.forEach((_, i) => timers.push(window.setTimeout(() => setLines(i + 1), quick ? 0 : 180 + i * 190)));
      timers.push(window.setTimeout(() => setStage("logo"), quick ? 600 : 180 + POST_LINES.length * 190 + 450));
    } else {
      timers.push(window.setTimeout(() => done.current(), quick ? 700 : 2600));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [stage]);

  // Any key or click skips the rest. The key is consumed (and a whole click is waited for), so the
  // same press never also lands on the welcome screen that appears next.
  useEffect(() => {
    const skip = (e: Event) => {
      e.preventDefault();
      done.current();
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("click", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("click", skip);
    };
  }, []);

  return (
    <div className="xp-boot" data-testid="boot" aria-live="polite">
      {stage === "post" ? (
        <div className="xp-post">
          {POST_LINES.slice(0, lines).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="xp-post-skip">Press any key to skip</p>
        </div>
      ) : (
        <div className="xp-boot-logo">
          <p className="logo-mark logo-mark--on-screen text-6xl sm:text-7xl">XPLOR9</p>
          <p className="xp-boot-sub">your childhood, reconnected</p>
          <div className="xp-boot-bar" role="progressbar" aria-label="Starting XPLOR9" aria-valuetext="Starting">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  );
}

export function Welcome({ name, onLogin }: { name: string; onLogin: () => void }) {
  const tile = useRef<HTMLButtonElement>(null);
  useEffect(() => tile.current?.focus(), []);
  return (
    <div className="xp-welcome" data-testid="welcome">
      <div className="xp-welcome-band xp-welcome-band--top" />
      <div className="xp-welcome-main">
        <div className="xp-welcome-brand">
          <p className="logo-mark logo-mark--on-screen text-5xl sm:text-6xl">XPLOR9</p>
          <p>To begin, click your name</p>
        </div>
        <div className="xp-welcome-divider" aria-hidden />
        <button ref={tile} type="button" className="xp-welcome-user" onClick={onLogin}>
          <span className="xp-user-tile xp-user-tile--big" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-xl">{name}</span>
        </button>
      </div>
      <div className="xp-welcome-band xp-welcome-band--bottom">
        <p>Sound plays from here on. Change it any time from the speaker next to the clock.</p>
      </div>
    </div>
  );
}

export function ShutDownDialog({ onLogOff, onRestart, onTurnOff, onCancel }: { onLogOff: () => void; onRestart: () => void; onTurnOff: () => void; onCancel: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div className="xp-dim" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="shutdown-title" className="xp-shutdown" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <div className="xp-shutdown-head">
          <h2 id="shutdown-title">Turn off computer</h2>
          <span className="logo-mark logo-mark--on-screen text-2xl">XPLOR9</span>
        </div>
        <div className="xp-shutdown-body">
          <button ref={first} type="button" className="xp-shutdown-option" onClick={onLogOff}>
            <span className="xp-shutdown-icon xp-shutdown-icon--logoff" aria-hidden />
            Log off
          </button>
          <button type="button" className="xp-shutdown-option" onClick={onTurnOff}>
            <span className="xp-shutdown-icon xp-shutdown-icon--off" aria-hidden />
            Turn off
          </button>
          <button type="button" className="xp-shutdown-option" onClick={onRestart}>
            <span className="xp-shutdown-icon xp-shutdown-icon--restart" aria-hidden />
            Restart
          </button>
        </div>
        <div className="xp-shutdown-foot">
          <button type="button" className="xp-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShuttingDown() {
  return (
    <div className="xp-welcome" data-testid="shutting-down">
      <div className="xp-welcome-band xp-welcome-band--top" />
      <div className="xp-welcome-main">
        <p className="logo-mark logo-mark--on-screen text-5xl">XPLOR9</p>
        <p className="text-lg" role="status">
          Saving your settings…
        </p>
      </div>
      <div className="xp-welcome-band xp-welcome-band--bottom" />
    </div>
  );
}

export function PoweredOff({ onPowerOn }: { onPowerOn: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="xp-off" data-testid="powered-off">
      <p>It is now safe to switch off your computer.</p>
      <button ref={button} type="button" className="xp-power" onClick={onPowerOn}>
        <span aria-hidden>⏻</span> Switch on
      </button>
    </div>
  );
}
