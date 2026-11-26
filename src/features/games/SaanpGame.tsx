"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MenuBar } from "@/features/desktop/MenuBar";
import { useLocalStore } from "@/lib/storage/store";
import { arcadePrefs, bestStore, markPlayed, saveSaanpScore } from "./arcadeStore";
import { SPEEDS, type Speed } from "./scores";
import { newSnakeGame, step, turn, type Dir, type SnakeState } from "./snake";
import "./arcade.css";

/**
 * Saanp in its own window: an LCD board, a Game / Speed / Help menu bar and a status bar.
 * Arrow keys or W A S D steer, Space pauses; on touch screens, the direction pad.
 */

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};
/** The first board is drawn before any input, so its food spot is fixed, not random. */
const firstBoard = () => newSnakeGame(16, () => 0.37);

export function SaanpGame() {
  const [state, setState] = useState<SnakeState>(firstBoard);
  const [running, setRunning] = useState(false);
  const [help, setHelp] = useState(false);
  const best = useLocalStore(bestStore).saanp;
  const prefs = useLocalStore(arcadePrefs);
  const board = useRef<HTMLDivElement>(null);
  const active = running && !state.over;

  useEffect(() => markPlayed("saanp"), []);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setState((s) => step(s)), SPEEDS[prefs.speed].tickMs);
    return () => window.clearInterval(id);
  }, [active, prefs.speed]);
  useEffect(() => {
    if (state.over) saveSaanpScore(state.score);
  }, [state.over, state.score]);

  const start = () => {
    if (state.over) setState(newSnakeGame());
    setRunning(true);
    board.current?.focus();
  };
  const newGame = () => {
    setState(newSnakeGame());
    setRunning(false);
    board.current?.focus();
  };
  const steer = (d: Dir) => {
    setState((s) => turn(s, d));
    if (!state.over) setRunning(true);
  };
  const onKey = (e: KeyboardEvent) => {
    const d = KEY_DIR[e.key];
    if (d) {
      e.preventDefault();
      steer(d);
    } else if (e.key === " ") {
      e.preventDefault();
      if (state.over) start();
      else setRunning(!active);
    }
  };
  const setSpeed = (speed: Speed) => arcadePrefs.set((p) => ({ ...p, speed }));

  const cells = new Map<number, string>();
  state.snake.forEach((p, i) => cells.set(p.y * state.size + p.x, i === 0 ? "sn-head" : "sn-body"));
  if (state.food) cells.set(state.food.y * state.size + state.food.x, "sn-food");
  const status = state.over ? `Game over. Score ${state.score}.` : active ? "" : "Paused. Press Space or Start.";

  return (
    <div className="arc-game" onKeyDown={(e) => e.key === "F2" && (e.preventDefault(), newGame())}>
      <MenuBar
        label="Saanp menu"
        menus={[
          {
            label: "Game",
            items: [
              { label: "New game", hint: "F2", run: newGame },
              { label: active ? "Pause" : "Resume", hint: "Space", run: () => (active ? setRunning(false) : start()) },
            ],
          },
          { label: "Speed", items: (Object.keys(SPEEDS) as Speed[]).map((s) => ({ label: SPEEDS[s].name, checked: prefs.speed === s, run: () => setSpeed(s) })) },
          { label: "Help", items: [{ label: "How to play", run: () => setHelp((h) => !h), checked: help }] },
        ]}
      />
      <div className="sn-body-wrap">
        <div className="sn-bezel">
          <div className="sn-top">
            <span>Score {state.score}</span>
            <span>Best {best}</span>
            <button type="button" className="sn-start" onClick={active ? () => setRunning(false) : start}>
              {active ? "Pause" : state.over ? "Play again" : "Start"}
            </button>
          </div>
          <div
            ref={board}
            tabIndex={0}
            onKeyDown={onKey}
            role="application"
            aria-label={`Saanp board. Arrow keys or W A S D to steer, Space to pause. Score ${state.score}.`}
            aria-describedby="saanp-status"
            className="sn-board"
            style={{ gridTemplateColumns: `repeat(${state.size}, 1fr)` }}
            data-testid="saanp-board"
          >
            {Array.from({ length: state.size * state.size }, (_, i) => (
              <div key={i} className={cells.get(i)} />
            ))}
          </div>
          <p id="saanp-status" role="status" className="sn-status">
            {status}
          </p>
        </div>
        {help && (
          <p className="arc-help">
            Steer with the arrow keys or W A S D (or the pad on a touch screen). Eat mangoes to grow; don&apos;t hit the wall or yourself. Space pauses, F2 starts a new
            game. Faster speeds come from the Speed menu.
          </p>
        )}
        <div className="sn-pad" role="group" aria-label="Direction buttons">
          <span />
          <DirButton d="up" label="▲" onPress={steer} />
          <span />
          <DirButton d="left" label="◀" onPress={steer} />
          <span />
          <DirButton d="right" label="▶" onPress={steer} />
          <span />
          <DirButton d="down" label="▼" onPress={steer} />
        </div>
      </div>
      <div className="xp-statusbar arc-status">
        <span>Speed: {SPEEDS[prefs.speed].name}</span>
        <span>Length {state.snake.length}</span>
      </div>
    </div>
  );
}

function DirButton({ d, label, onPress }: { d: Dir; label: string; onPress: (d: Dir) => void }) {
  return (
    <button
      type="button"
      aria-label={`Turn ${d}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress(d);
      }}
      className="sn-pad-key"
    >
      {label}
    </button>
  );
}
