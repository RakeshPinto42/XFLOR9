"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";
import { newSnakeGame, step, turn, type Dir, type SnakeState } from "./snake";
import { flagsLeft, newMinesGame, reveal, toggleFlag, type MinesState } from "./mines";

/** Best results, kept only in this browser. Stored data is untrusted, so only well-formed numbers survive. */
interface Best {
  saanp: number;
  /** Fastest Mines win in seconds; null until the first win. */
  minesSeconds: number | null;
}
const bestStore = createLocalStore<Best>(STORAGE_KEYS.gamesBest, { saanp: 0, minesSeconds: null }, (raw) => {
  const r = (raw ?? {}) as Partial<Record<keyof Best, unknown>>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const saanp = num(r.saanp);
  const mines = num(r.minesSeconds);
  return { saanp: saanp !== null && saanp >= 0 ? Math.floor(saanp) : 0, minesSeconds: mines !== null && mines > 0 ? mines : null };
});
const recordSaanp = (score: number) => bestStore.set((b) => (score > b.saanp ? { ...b, saanp: score } : b));
const recordMinesWin = (sec: number) =>
  bestStore.set((b) => (b.minesSeconds === null || sec < b.minesSeconds ? { ...b, minesSeconds: sec } : b));

/** Wall-clock time, read only from event handlers and timers. */
const clock = () => Date.now();
const noSubscribe = () => () => {};

type GameId = "saanp" | "mines";
const GAMES: { id: GameId; name: string; blurb: string }[] = [
  { id: "saanp", name: "Saanp", blurb: "Guide the snake to the mangoes. Don't hit the wall or yourself." },
  { id: "mines", name: "Mines", blurb: "Open every safe square. Numbers tell you how many mines are next door." },
];

export function GamesHub() {
  const [game, setGame] = useState<GameId>("saanp");
  const best = useLocalStore(bestStore);
  const current = GAMES.find((g) => g.id === game)!;

  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl sm:text-5xl">Games</h1>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">
        Original takes on classic arcade and puzzle games. Best scores stay in this browser.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Choose a game">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === game}
            onClick={() => setGame(g.id)}
            className="rounded-full border-2 border-ink px-5 py-2 font-semibold aria-pressed:bg-ink aria-pressed:text-panel"
          >
            {g.name}
          </button>
        ))}
      </div>

      <GameFrame title={current.name} blurb={current.blurb}>
        {game === "saanp" ? <Saanp best={best.saanp} /> : <Mines best={best.minesSeconds} />}
      </GameFrame>
    </section>
  );
}

function GameFrame({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const canFullscreen = useSyncExternalStore(noSubscribe, () => document.fullscreenEnabled, () => false);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void ref.current?.requestFullscreen().catch(() => {}); // refused (e.g. embedded): keep playing inline
  };
  return (
    <div
      ref={ref}
      className="mt-6 rounded-2xl bg-screen p-4 text-phosphor sm:p-6 [&:fullscreen]:grid [&:fullscreen]:place-content-center [&:fullscreen]:rounded-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-pixel text-xl">{title}</h2>
          <p className="mt-1 text-sm text-phosphor/80">{blurb}</p>
        </div>
        {canFullscreen && (
          <button type="button" onClick={toggle} className="rounded-full border border-phosphor/60 px-4 py-1.5 text-sm">
            Fullscreen
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ---------------- Saanp ---------------- */

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
};
const TICK_MS = 130;
/** The first board is rendered on the server too, so its food spot must not be random. */
const firstBoard = () => newSnakeGame(16, () => 0.37);

function Saanp({ best }: { best: number }) {
  const [state, setState] = useState<SnakeState>(firstBoard);
  const [running, setRunning] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const active = running && !state.over;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setState((s) => step(s)), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  // The best score lives in an external store, not React state.
  useEffect(() => {
    if (state.over) recordSaanp(state.score);
  }, [state.over, state.score]);

  const start = () => {
    if (state.over) setState(newSnakeGame());
    setRunning(true);
    boardRef.current?.focus();
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

  const cells = new Map<number, string>();
  state.snake.forEach((p, i) => cells.set(p.y * state.size + p.x, i === 0 ? "bg-reading rounded-sm" : "bg-reading/70 rounded-sm"));
  if (state.food) cells.set(state.food.y * state.size + state.food.x, "bg-radio rounded-full");

  const status = state.over ? `Game over. Score ${state.score}.` : active ? "" : "Paused. Press Space or Start.";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 font-pixel text-sm">
        <span>Score {state.score}</span>
        <span>Best {best}</span>
        <button
          type="button"
          onClick={active ? () => setRunning(false) : start}
          className="rounded-full bg-phosphor px-4 py-1.5 text-screen"
        >
          {active ? "Pause" : state.over ? "Play again" : "Start"}
        </button>
      </div>
      <div
        ref={boardRef}
        tabIndex={0}
        onKeyDown={onKey}
        role="application"
        aria-label={`Saanp board. Arrow keys or W A S D to steer, Space to pause. Score ${state.score}.`}
        aria-describedby="saanp-status"
        className="mx-auto grid aspect-square w-full max-w-md touch-none rounded-lg border border-phosphor/30 bg-black/40 outline-none focus-visible:ring-4 focus-visible:ring-games"
        style={{ gridTemplateColumns: `repeat(${state.size}, 1fr)` }}
        data-testid="saanp-board"
      >
        {Array.from({ length: state.size * state.size }, (_, i) => (
          <div key={i} className={`m-px ${cells.get(i) ?? ""}`} />
        ))}
      </div>
      <p id="saanp-status" role="status" className="mt-2 min-h-6 text-center font-pixel text-sm">
        {status}
      </p>
      <div className="mx-auto mt-2 grid w-40 grid-cols-3 gap-1 sm:hidden" role="group" aria-label="Direction buttons">
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
      className="aspect-square rounded-lg bg-phosphor/20 text-xl"
    >
      {label}
    </button>
  );
}

/* ---------------- Mines ---------------- */

const NEAR_COLOUR = ["", "text-tv", "text-reading", "text-brand", "text-games", "text-radio", "text-reading", "text-phosphor", "text-phosphor"];

function Mines({ best }: { best: number | null }) {
  const [state, setState] = useState<MinesState>(() => newMinesGame());
  const [flagMode, setFlagMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finalSeconds, setFinalSeconds] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "playing") return;
    const id = window.setInterval(() => setNow(clock()), 500);
    return () => window.clearInterval(id);
  }, [state.status]);

  const restart = () => {
    setState(newMinesGame());
    setStartedAt(null);
    setFinalSeconds(null);
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
      if (next.status === "won") recordMinesWin(sec);
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
    if (j >= 0 && j < state.cells.length && (Math.abs(delta) !== 1 || sameRow)) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${j}"]`)?.focus();
    }
  };

  const seconds = finalSeconds ?? (startedAt === null ? 0 : Math.max(0, Math.round((now - startedAt) / 1000)));
  const status =
    state.status === "won" ? `Cleared in ${seconds} seconds!` : state.status === "lost" ? "Boom. That was a mine." : "";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 font-pixel text-sm">
        <span>Mines left {flagsLeft(state)}</span>
        <span>Time {seconds}s</span>
        <span>Best {best === null ? "–" : `${best}s`}</span>
        <button
          type="button"
          aria-pressed={flagMode}
          onClick={() => setFlagMode((f) => !f)}
          className="rounded-full border border-phosphor/60 px-4 py-1.5 aria-pressed:bg-brand aria-pressed:text-white"
        >
          Flag mode {flagMode ? "on" : "off"}
        </button>
        <button type="button" onClick={restart} className="rounded-full bg-phosphor px-4 py-1.5 text-screen">
          New game
        </button>
      </div>
      <div
        ref={gridRef}
        onKeyDown={onGridKey}
        role="group"
        aria-label="Minefield. Enter opens a square, F flags it, arrow keys move."
        className="mx-auto grid w-full max-w-md gap-1"
        style={{ gridTemplateColumns: `repeat(${state.cols}, 1fr)` }}
        data-testid="mines-board"
      >
        {state.cells.map((c, i) => {
          const label = c.open ? (c.mine ? "mine" : c.near ? `${c.near}` : "empty") : c.flag ? "flagged" : "closed";
          return (
            <button
              key={i}
              type="button"
              data-cell={i}
              aria-label={`Row ${Math.floor(i / state.cols) + 1}, column ${(i % state.cols) + 1}: ${label}`}
              onClick={() => (flagMode ? flag(i) : open(i))}
              onContextMenu={(e) => {
                e.preventDefault();
                flag(i);
              }}
              className={`aspect-square rounded font-pixel text-lg ${
                c.open ? (c.mine ? "bg-brand" : "bg-black/40") : "bg-phosphor/25 hover:bg-phosphor/40"
              } ${NEAR_COLOUR[c.near]}`}
            >
              {c.open ? (c.mine ? "✹" : c.near || "") : c.flag ? "⚑" : ""}
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-2 min-h-6 text-center font-pixel text-sm">
        {status}
      </p>
      <p className="text-center text-xs text-phosphor/70">
        Right-click or turn on flag mode to mark a mine. Your first square is always safe.
      </p>
    </div>
  );
}
