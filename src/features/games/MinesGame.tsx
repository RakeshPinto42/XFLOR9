"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MenuBar } from "@/features/desktop/MenuBar";
import { wm } from "@/features/desktop/store";
import { useLocalStore } from "@/lib/storage/store";
import { arcadePrefs, bestStore, markPlayed, saveMinesWin } from "./arcadeStore";
import { flagsLeft, newMinesGame, reveal, toggleFlag, type MinesState } from "./mines";
import { LEVELS, type Level } from "./scores";
import "./arcade.css";

/**
 * Mines in its own window, as the classic desktop puzzle: LED counters for mines left and time,
 * a face button for a new game, raised squares, and Beginner / Intermediate / Expert. The window
 * grows or shrinks to fit the field. Right-click (or Flag mode, or F) marks a mine.
 */

const CELL = 26; // px, with the board's padding and the window frame this sets the window size
const clock = () => Date.now();
const newGame = (level: Level) => newMinesGame(LEVELS[level].cols, LEVELS[level].rows, LEVELS[level].mines);

export function MinesGame() {
  const prefs = useLocalStore(arcadePrefs);
  const best = useLocalStore(bestStore).mines;
  const [level, setLevel] = useState<Level>(prefs.level);
  const [state, setState] = useState<MinesState>(() => newGame(prefs.level));
  const [flagMode, setFlagMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finalSeconds, setFinalSeconds] = useState<number | null>(null);
  const [pressing, setPressing] = useState(false);
  const [help, setHelp] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => markPlayed("mines"), []);
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = window.setInterval(() => setNow(clock()), 500);
    return () => window.clearInterval(id);
  }, [state.status]);

  // Fit the window to the field (desktop only; phones show every window full screen).
  useEffect(() => {
    const L = LEVELS[level];
    const win = wm.get().windows.find((w) => w.id === "mines");
    if (!win || win.maximized) return;
    const w = L.cols * CELL + 56;
    const h = L.rows * CELL + 196;
    const area = wm.area();
    wm.resize("mines", { x: win.x, y: win.y, w: Math.min(w, area.w), h: Math.min(h, area.h) });
    wm.commit("mines");
  }, [level]);

  const restart = (l: Level = level) => {
    setState(newGame(l));
    setStartedAt(null);
    setFinalSeconds(null);
  };
  const chooseLevel = (l: Level) => {
    setLevel(l);
    arcadePrefs.set((p) => ({ ...p, level: l }));
    restart(l);
  };
  const open = (i: number) => {
    const t = clock();
    const started = startedAt ?? t;
    if (startedAt === null) {
      setStartedAt(t);
      setNow(t);
    }
    const next = reveal(state, i);
    setState(next);
    if (next !== state && (next.status === "won" || next.status === "lost")) {
      const sec = Math.max(1, Math.round((t - started) / 1000));
      setFinalSeconds(sec);
      if (next.status === "won") saveMinesWin(level, sec);
    }
  };
  const flag = (i: number) => setState((s) => toggleFlag(s, i));

  const onGridKey = (e: KeyboardEvent) => {
    const i = Number((e.target as HTMLElement).dataset.cell);
    if (!Number.isInteger(i)) return;
    if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      flag(i);
      return;
    }
    const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -state.cols, ArrowDown: state.cols };
    const delta = move[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const j = i + delta;
    const sameRow = Math.floor(j / state.cols) === Math.floor(i / state.cols);
    if (j >= 0 && j < state.cells.length && (Math.abs(delta) !== 1 || sameRow)) grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${j}"]`)?.focus();
  };

  const seconds = Math.min(999, finalSeconds ?? (startedAt === null ? 0 : Math.max(0, Math.round((now - startedAt) / 1000))));
  const status = state.status === "won" ? `Cleared in ${seconds} seconds!` : state.status === "lost" ? "Boom. That was a mine." : "";
  const face = state.status === "won" ? "cool" : state.status === "lost" ? "dizzy" : pressing ? "wow" : "smile";
  const bestText = (l: Level) => (best[l] === null ? "–" : `${best[l]}s`);

  return (
    <div className="arc-game" onKeyDown={(e) => e.key === "F2" && (e.preventDefault(), restart())}>
      <MenuBar
        label="Mines menu"
        menus={[
          {
            label: "Game",
            items: [
              { label: "New game", hint: "F2", run: () => restart() },
              "separator",
              ...(Object.keys(LEVELS) as Level[]).map((l) => ({ label: LEVELS[l].name, checked: level === l, run: () => chooseLevel(l) })),
              "separator",
              { label: "Flag mode", checked: flagMode, run: () => setFlagMode((f) => !f) },
            ],
          },
          { label: "Help", items: [{ label: "How to play", checked: help, run: () => setHelp((h) => !h) }] },
        ]}
      />
      <div className="mn-wrap">
        <div className="mn-panel">
          <div className="mn-head">
            <span className="mn-led" aria-label={`Mines left ${flagsLeft(state)}`} role="img">
              {String(Math.max(-99, flagsLeft(state))).padStart(3, "0")}
            </span>
            <button type="button" className="mn-face" onClick={() => restart()} aria-label="New game" data-face={face}>
              <Face kind={face} />
            </button>
            <span className="mn-led" aria-label={`Time ${seconds} seconds`} role="img">
              {String(seconds).padStart(3, "0")}
            </span>
          </div>
          <div
            ref={grid}
            onKeyDown={onGridKey}
            onPointerDown={() => setPressing(true)}
            onPointerUp={() => setPressing(false)}
            onPointerLeave={() => setPressing(false)}
            role="group"
            aria-label="Minefield. Enter opens a square, F flags it, arrow keys move."
            className="mn-grid"
            style={{ gridTemplateColumns: `repeat(${state.cols}, ${CELL}px)` }}
            data-testid="mines-board"
          >
            {state.cells.map((c, i) => {
              const label = c.open ? (c.mine ? "mine" : c.near ? `${c.near}` : "empty") : c.flag ? "flagged" : "closed";
              return (
                <button
                  key={i}
                  type="button"
                  data-cell={i}
                  data-open={c.open || undefined}
                  data-mine={(c.open && c.mine) || undefined}
                  data-near={c.open && !c.mine ? c.near : undefined}
                  aria-label={`Row ${Math.floor(i / state.cols) + 1}, column ${(i % state.cols) + 1}: ${label}`}
                  onClick={() => (flagMode ? flag(i) : open(i))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    flag(i);
                  }}
                  className="mn-cell"
                >
                  {c.open ? (c.mine ? "✹" : c.near || "") : c.flag ? "⚑" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <p role="status" className="mn-status">
          {status}
        </p>
        {help && (
          <p className="arc-help">
            Open every square without a mine. A number tells how many of the eight squares around it hide mines. Right-click, press F, or turn on Flag mode to mark a
            mine. Your first square is always safe. F2 or the face starts a new game.
          </p>
        )}
      </div>
      <div className="xp-statusbar arc-status">
        <span>
          {LEVELS[level].name} · Best {bestText(level)}
        </span>
        <button type="button" className="arc-flag" aria-pressed={flagMode} onClick={() => setFlagMode((f) => !f)}>
          Flag mode {flagMode ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}

/** The new-game button's face (original drawing): smiling, surprised while pressing, cool on a win, dizzy on a loss. */
function Face({ kind }: { kind: "smile" | "wow" | "cool" | "dizzy" }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#ffd23f" stroke="#1b2030" strokeWidth="1.4" />
      {kind === "cool" ? (
        <path d="M5 9.5h14l-1 3h-4l-1-1.5h-2L10 12.5H6z" fill="#1b2030" />
      ) : kind === "dizzy" ? (
        <path d="M7 8l3 3M10 8l-3 3M14 8l3 3M17 8l-3 3" stroke="#1b2030" strokeWidth="1.4" />
      ) : (
        <>
          <circle cx="8.5" cy="9.5" r="1.3" fill="#1b2030" />
          <circle cx="15.5" cy="9.5" r="1.3" fill="#1b2030" />
        </>
      )}
      {kind === "wow" ? <circle cx="12" cy="16" r="2.2" fill="#1b2030" /> : kind === "dizzy" ? <path d="M8 17q4 -3 8 0" stroke="#1b2030" strokeWidth="1.4" fill="none" /> : <path d="M7.5 14.5q4.5 4 9 0" stroke="#1b2030" strokeWidth="1.5" fill="none" strokeLinecap="round" />}
    </svg>
  );
}
